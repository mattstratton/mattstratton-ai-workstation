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

import { createSecurityGroup } from "../networking";

describe("createSecurityGroup", () => {
    let sg: ReturnType<typeof createSecurityGroup>;

    before(() => {
        sg = createSecurityGroup();
    });

    it("allows TCP 22 from everywhere", done => {
        sg.ingress.apply((rules: any[]) => {
            const rule = rules.find(
                (r: any) => r.protocol === "tcp" && r.fromPort === 22,
            );
            assert.ok(rule, "missing TCP 22 ingress rule");
            assert.deepStrictEqual(rule.cidrBlocks, ["0.0.0.0/0"]);
            done();
        });
    });

    it("allows UDP 60000-61000 for mosh", done => {
        sg.ingress.apply((rules: any[]) => {
            const rule = rules.find(
                (r: any) => r.protocol === "udp" && r.fromPort === 60000,
            );
            assert.ok(rule, "missing UDP 60000 ingress rule");
            assert.strictEqual(rule.toPort, 61000);
            assert.deepStrictEqual(rule.cidrBlocks, ["0.0.0.0/0"]);
            done();
        });
    });

    it("allows all outbound traffic", done => {
        sg.egress.apply((rules: any[]) => {
            const rule = rules[0];
            assert.ok(rule, "missing egress rule");
            assert.strictEqual(rule.protocol, "-1");
            assert.deepStrictEqual(rule.cidrBlocks, ["0.0.0.0/0"]);
            done();
        });
    });
});
