{ pkgs, ... }:

{
  packages = with pkgs; [
    git
    fish
    fish-lsp
  ];

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;

    yarn.enable = true;
  };
}
