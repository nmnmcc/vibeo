{ pkgs }:

with pkgs;

let
  python = python312;
  pythonPackages = python312Packages;
in
[
  bash
  fish
  cacert
  cairo
  coreutils
  fontconfig
  freetype
  gcc
  geos
  git
  glib
  harfbuzz
  meson
  ninja
  nodejs
  pango
  pkg-config
  uv

  python
  pythonPackages.pip
  pythonPackages.setuptools
  pythonPackages.virtualenv
  pythonPackages.wheel
]
