import * as assert from "assert";
import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks(
    {
        newResource: (args: pulumi.runtime.MockResourceArgs) => ({
            id: `${args.name}_id`,
            state: args.inputs,
        }),
        call: (args: pulumi.runtime.MockCallArgs) => ({
            ...args.inputs,
            // Simulate AMI lookup returning a fake ID
            id: "ami-0fake1234567890ab",
        }),
    },
    "mattstratton-ai-workstation",
    "dev",
    true,
);

import * as aws from "@pulumi/aws";
import { createCompute } from "../compute";
import { WorkstationConfig } from "../config";

const testConfig: WorkstationConfig = {
    instanceType: "t3.large",
    ebsSizeGb: 100,
    userName: "matty",
    gitName: "Matt Stratton",
    gitEmail: "matty@tigerdata.com",
    sshPublicKey: pulumi.output("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 test"),
    githubSecretName: "workstation/github-ssh-key",
    dotfilesRepo: "https://github.com/mattstratton/matty-dotfiles",
    awsRegion: "us-east-1",
};

describe("createCompute", () => {
    let sg: aws.ec2.SecurityGroup;
    let profile: aws.iam.InstanceProfile;
    let resources: ReturnType<typeof createCompute>;

    before(() => {
        sg = new aws.ec2.SecurityGroup("test-sg", {
            ingress: [],
            egress: [],
        });
        profile = new aws.iam.InstanceProfile("test-profile", {});
        resources = createCompute(
            testConfig,
            sg,
            profile,
            pulumi.output("#!/bin/bash\necho hello"),
        );
    });

    it("creates an EC2 instance", () => {
        assert.ok(resources.instance instanceof pulumi.CustomResource);
    });

    it("creates an Elastic IP", () => {
        assert.ok(resources.eip instanceof pulumi.CustomResource);
    });

    it("uses configurable instance type", done => {
        resources.instance.instanceType.apply(itype => {
            assert.strictEqual(itype, "t3.large");
            done();
        });
    });

    it("sets root volume to configurable size", done => {
        resources.instance.rootBlockDevice.apply(rbd => {
            assert.strictEqual((rbd as any).volumeSize, 100);
            assert.strictEqual((rbd as any).volumeType, "gp3");
            done();
        });
    });

    it("tags instance with Name=ai-workstation", done => {
        resources.instance.tags.apply(tags => {
            assert.strictEqual((tags as any)["Name"], "ai-workstation");
            done();
        });
    });
});
