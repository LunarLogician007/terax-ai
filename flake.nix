{
  description = "TOSS Terminal - a lightweight tiling terminal workspace, based on Terax";

  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }: let
    forAllSystems = nixpkgs.lib.genAttrs [ "x86_64-linux" "x86_64-darwin" "aarch64-darwin" ];
  in {
    packages = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      toss = pkgs.callPackage ./nix/package.nix { };
      default = self.packages.${system}.toss;
    });

    nixosModules.toss = { pkgs, ... }: {
      environment.systemPackages = [ self.packages.${pkgs.system}.toss ];
    };

    darwinModules.toss = { pkgs, ... }: {
      environment.systemPackages = [ self.packages.${pkgs.system}.toss ];
    };
  };
}
