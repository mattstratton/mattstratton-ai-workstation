import * as pulumi from "@pulumi/pulumi";

export interface WorkstationConfig {
    instanceType: string;
    ebsSizeGb: number;
    userName: string;
    gitName: string;
    gitEmail: string;
    sshPublicKey: pulumi.Output<string>;
    githubSecretName: string;
    dotfilesRepo: string;
    awsRegion: string;
}

export function loadConfig(): WorkstationConfig {
    const config = new pulumi.Config();
    const awsConfig = new pulumi.Config("aws");

    return {
        instanceType: config.get("instance-type") ?? "t3.large",
        ebsSizeGb: config.getNumber("ebs-size-gb") ?? 100,
        userName: config.get("user-name") ?? "matty",
        gitName: config.get("git-name") ?? "Matt Stratton",
        gitEmail: config.get("git-email") ?? "matty@tigerdata.com",
        sshPublicKey: config.requireSecret("ssh-public-key"),
        githubSecretName: config.get("github-secret-name") ?? "mattstratton-workstation/github-ssh-key",
        dotfilesRepo: config.get("dotfiles-repo") ?? "https://github.com/mattstratton/matty-dotfiles",
        awsRegion: awsConfig.get("region") ?? "us-east-1",
    };
}
