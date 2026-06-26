import * as aws from "@pulumi/aws";

export function createInstanceProfile(
    githubSecretName: string,
): aws.iam.InstanceProfile {
    const role = new aws.iam.Role("mattstratton-workstation-role", {
        name: "mattstratton-ai-workstation-role",
        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Action: "sts:AssumeRole",
                    Effect: "Allow",
                    Principal: { Service: "ec2.amazonaws.com" },
                },
            ],
        }),
    });

    new aws.iam.RolePolicy("mattstratton-workstation-secret-policy", {
        role: role.name,
        policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Action: ["secretsmanager:GetSecretValue"],
                    Resource: `arn:aws:secretsmanager:*:*:secret:${githubSecretName}*`,
                },
            ],
        }),
    });

    return new aws.iam.InstanceProfile("mattstratton-workstation-profile", {
        name: "mattstratton-ai-workstation-profile",
        role: role.name,
    });
}
