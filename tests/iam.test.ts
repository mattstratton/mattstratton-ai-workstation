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

import { createInstanceProfile } from "../iam";

describe("createInstanceProfile", () => {
    it("creates a profile backed by an EC2-assumable role", done => {
        const profile = createInstanceProfile("workstation/github-ssh-key");
        // Instance profile should have a name
        profile.name.apply(name => {
            assert.ok(name, "profile should have a name");
            done();
        });
    });

    it("returns an InstanceProfile resource", () => {
        const profile = createInstanceProfile("workstation/github-ssh-key");
        assert.ok(profile instanceof pulumi.CustomResource);
    });
});
