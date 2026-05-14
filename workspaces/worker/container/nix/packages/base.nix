{ pkgs }:

let
  python = pkgs.python312;
  pythonPackages = pkgs.python312Packages;
in
[
  pkgs.bash
  pkgs.cacert
  pkgs.cairo
  pkgs.coreutils
  pkgs.fontconfig
  pkgs.freetype
  pkgs.gcc
  pkgs.geos
  pkgs.git
  pkgs.glib
  pkgs.harfbuzz
  pkgs.meson
  pkgs.ninja
  pkgs.nodejs
  pkgs.pango
  pkgs.pkg-config
  pkgs.uv

  python
  pythonPackages.pip
  pythonPackages.setuptools
  pythonPackages.virtualenv
  pythonPackages.wheel
]
