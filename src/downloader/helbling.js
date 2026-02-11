const axios = require('axios');
const fs = require('fs');
const path = require('path');
const prompts = require('prompts');
const { PDFDocument } = require('pdf-lib');

const AUTH_URL = 'https://service-avidant.helbling.com/api/v1/token';
const JOURNALS_URL = 'https://service-avidant.helbling.com/api/v1/product/codes/urn';
const ASSET_URL = 'https://service-avidant.helbling.com/api/v1/asset';

function sanitizeFileName(fileName) {
    return (fileName || 'helbling_book')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9 \(\)_\-,\.]/g, '')
        .trim() || 'helbling_book';
}

function getJournalLabel(journal) {
    const title = journal?.materialDescription?.materialTitle || 'Untitled';
    const subtitle = journal?.materialDescription?.materialSubTitle || '';
    const code = journal?.code || '';
    return `${title}${subtitle ? ` - ${subtitle}` : ''}${code ? ` (${code})` : ''}`;
}

function extractPdfParts(materialStructure) {
    const seenPdfUrls = new Set();
    const parts = [];

    (materialStructure || []).forEach((chapter, chapterIndex) => {
        (chapter?.subchapter || []).forEach((subchapter, subchapterIndex) => {
            (subchapter?.mediaItems || []).forEach((mediaItem, mediaItemIndex) => {
                (mediaItem?.sequence || []).forEach((sequenceItem, sequenceIndex) => {
                    const pdfUrl = (sequenceItem?.pdf || '').trim();
                    if (!pdfUrl || !/^https?:\/\//i.test(pdfUrl)) {
                        return;
                    }
                    if (seenPdfUrls.has(pdfUrl)) {
                        return;
                    }

                    seenPdfUrls.add(pdfUrl);

                    const parsedPage = parseInt(mediaItem?.page, 10);
                    parts.push({
                        chapterIndex,
                        subchapterIndex,
                        mediaItemIndex,
                        sequenceIndex,
                        page: Number.isFinite(parsedPage) ? parsedPage : Number.MAX_SAFE_INTEGER,
                        pageLabel: mediaItem?.page || '',
                        mediaTitle: mediaItem?.mediaTitle || mediaItem?.mediaName || `Part ${parts.length + 1}`,
                        pdfUrl,
                    });
                });
            });
        });
    });

    return parts.sort((a, b) => {
        return a.chapterIndex - b.chapterIndex
            || a.subchapterIndex - b.subchapterIndex
            || a.mediaItemIndex - b.mediaItemIndex
            || a.sequenceIndex - b.sequenceIndex;
    });
}

async function authenticate(email, passwd) {
    const body = new URLSearchParams();
    body.append('username', email);
    body.append('password', passwd);
    body.append('grant_type', 'password');

    const response = await axios({
        method: 'post',
        url: AUTH_URL,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        data: body.toString(),
    });

    if (!response.data?.access_token) {
        throw new Error(response.data?.error_description || response.data?.error || 'Authentication failed');
    }

    return response.data.access_token;
}

async function getJournals(accessToken) {
    const response = await axios({
        method: 'get',
        url: JOURNALS_URL,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
    });

    return Array.isArray(response.data) ? response.data : [];
}

async function getMapJson(journal) {
    const response = await axios({
        method: 'get',
        url: journal.structure_current_version_url,
    });

    return response.data;
}

async function downloadPdfAsset(accessToken, pdfUrl) {
    const body = new URLSearchParams();
    body.append('media-location', pdfUrl);
    body.append('type', 'online');

    const response = await axios({
        method: 'post',
        url: ASSET_URL,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        data: body.toString(),
        responseType: 'arraybuffer',
    });

    const bytes = Buffer.from(response.data);
    if (bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
        throw new Error(`Downloaded asset is not a PDF: ${pdfUrl}`);
    }

    return bytes;
}

async function selectJournal(journals) {
    if (journals.length === 1) {
        return journals[0];
    }

    const response = await prompts({
        type: 'select',
        name: 'journal',
        message: 'Select a Helbling book',
        choices: journals.map(journal => ({
            title: getJournalLabel(journal),
            value: journal,
        })),
    });

    return response.journal;
}

function helbling(email, passwd, deleteAllOldTempImages) {
    return (async () => {
        try {
            if (!email || !passwd) {
                console.log('helbling login failed - e900 (missing email/password)');
                return;
            }

            fs.mkdirSync('./out', { recursive: true });

            console.log('Logging in and loading Helbling library');
            const accessToken = await authenticate(email, passwd);

            const journals = await getJournals(accessToken);
            if (journals.length === 0) {
                console.log('No Helbling books found for this account');
                return;
            }

            const selectedJournal = await selectJournal(journals);
            if (!selectedJournal) {
                return;
            }

            console.log('Loading selected Helbling book metadata');
            const mapJson = await getMapJson(selectedJournal);
            const pdfParts = extractPdfParts(mapJson?.materialStructure);

            if (pdfParts.length === 0) {
                console.log('No downloadable PDF parts found for selected Helbling book');
                return;
            }

            const title = selectedJournal?.materialDescription?.materialTitle || selectedJournal?.materialDescription?.materialSubTitle || selectedJournal?.code || 'helbling_book';
            const outputFileName = `${sanitizeFileName(title)}_lossless.pdf`;
            const outputPath = path.join('./out', outputFileName);

            if (deleteAllOldTempImages && fs.existsSync(outputPath)) {
                fs.rmSync(outputPath, { force: true });
            }

            console.log(`Downloading ${pdfParts.length} PDF part(s) and merging losslessly`);

            const mergedDocument = await PDFDocument.create();
            let totalPages = 0;

            for (let i = 0; i < pdfParts.length; i++) {
                const part = pdfParts[i];
                console.log(`Downloading part ${i + 1}/${pdfParts.length}: ${part.mediaTitle}`);

                const pdfBytes = await downloadPdfAsset(accessToken, part.pdfUrl);
                const sourcePdf = await PDFDocument.load(pdfBytes);
                const sourcePages = await mergedDocument.copyPages(sourcePdf, sourcePdf.getPageIndices());

                sourcePages.forEach((page) => mergedDocument.addPage(page));
                totalPages += sourcePages.length;

                console.log(`Added ${sourcePages.length} page(s)`);
            }

            const mergedBytes = await mergedDocument.save();
            fs.writeFileSync(outputPath, mergedBytes);

            console.log(`Downloaded ${outputFileName}`);
            console.log(`Saved at ${outputPath} (${totalPages} pages)`);
        }
        catch (error) {
            console.log(error);
            console.log('Helbling download failed - e901');
        }
    })();
}

module.exports = helbling;
