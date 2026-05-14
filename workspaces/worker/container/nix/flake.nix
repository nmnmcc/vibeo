{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems = nixpkgs.lib.genAttrs systems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          base = import ./packages/base.nix { inherit pkgs; };
          runtime = import ./packages/runtime.nix { inherit pkgs; };
          env = {
            PYTHONDONTWRITEBYTECODE = "1";
            PYTHONUNBUFFERED = "1";
            UV_PYTHON_DOWNLOADS = "never";
            SSL_CERT_FILE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
            REQUESTS_CA_BUNDLE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
            CURL_CA_BUNDLE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
            LD_LIBRARY_PATH = "${pkgs.lib.makeLibraryPath [ pkgs.geos ]}";
          };
        in
        {
          default = pkgs.mkShell (env // {
            packages = base ++ runtime;
            shellHook = ''
              export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
            '';
          });

          install = pkgs.mkShell (env // {
            packages = base;
            shellHook = ''
              export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
            '';
          });
        }
      );

      formatter = forAllSystems (system: (pkgsFor system).nixfmt);
    };
}
