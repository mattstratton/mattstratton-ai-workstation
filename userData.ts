import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";
import { WorkstationConfig } from "./config";

export function buildUserData(cfg: WorkstationConfig): pulumi.Output<string> {
    const template = fs.readFileSync(
        path.join(__dirname, "scripts", "cloud-init.sh"),
        "utf8",
    );

    return cfg.sshPublicKey.apply(pubKey =>
        template
            .replace(/__USER_NAME__/g, cfg.userName)
            .replace(/__GIT_NAME__/g, cfg.gitName)
            .replace(/__GIT_EMAIL__/g, cfg.gitEmail)
            .replace(/__SSH_PUBLIC_KEY__/g, pubKey)
            .replace(/__GITHUB_SECRET_NAME__/g, cfg.githubSecretName)
            .replace(/__DOTFILES_REPO__/g, cfg.dotfilesRepo)
            .replace(/__AWS_REGION__/g, cfg.awsRegion),
    );
}
