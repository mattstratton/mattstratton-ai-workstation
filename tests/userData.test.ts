import * as assert from "assert";
import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks(
    {
        newResource: (args: pulumi.runtime.MockResourceArgs) => ({
            id: `${args.name}_id`,
            state: args.inputs,
        }),
        call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
    },
    "mattstratton-ai-workstation",
    "dev",
    true,
);

import { buildUserData } from "../userData";
import { WorkstationConfig } from "../config";

const testConfig: WorkstationConfig = {
    instanceType: "t3.large",
    ebsSizeGb: 100,
    userName: "testuser",
    gitName: "Test User",
    gitEmail: "test@example.com",
    sshPublicKey: pulumi.output("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 test"),
    githubSecretName: "test/github-key",
    dotfilesRepo: "https://github.com/test/dotfiles",
    awsRegion: "us-east-1",
};

describe("buildUserData", () => {
    it("returns a Pulumi Output", () => {
        const result = buildUserData(testConfig);
        // pulumi.Output is a class at runtime; cast needed for strict TS instanceof check
        assert.ok(result instanceof (pulumi.Output as unknown as Function));
    });

    it("replaces all __PLACEHOLDER__ markers", done => {
        const result = buildUserData(testConfig);
        result.apply(script => {
            const remaining = script.match(/__[A-Z_]+__/g);
            assert.strictEqual(
                remaining,
                null,
                `Unreplaced placeholders: ${remaining}`,
            );
            done();
        });
    });

    it("injects userName into script", done => {
        buildUserData(testConfig).apply(script => {
            assert.ok(
                script.includes("testuser"),
                "script should contain userName",
            );
            done();
        });
    });

    it("injects gitName into script", done => {
        buildUserData(testConfig).apply(script => {
            assert.ok(
                script.includes("Test User"),
                "script should contain gitName",
            );
            done();
        });
    });
});
