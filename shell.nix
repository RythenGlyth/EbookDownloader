{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  nativeBuildInputs = with pkgs; [
    ffmpeg
    nodejs
    mupdf
    imagemagick
  ];
}
