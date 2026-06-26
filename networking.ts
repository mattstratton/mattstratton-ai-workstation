import * as aws from "@pulumi/aws";

export function createSecurityGroup(): aws.ec2.SecurityGroup {
    return new aws.ec2.SecurityGroup("workstation-sg", {
        name: "ai-workstation",
        description: "AI workstation: SSH and mosh",
        ingress: [
            {
                protocol: "tcp",
                fromPort: 22,
                toPort: 22,
                cidrBlocks: ["0.0.0.0/0"],
                ipv6CidrBlocks: ["::/0"],
                description: "SSH and herdr",
            },
            {
                protocol: "udp",
                fromPort: 60000,
                toPort: 61000,
                cidrBlocks: ["0.0.0.0/0"],
                ipv6CidrBlocks: ["::/0"],
                description: "mosh (for moshi mobile app)",
            },
        ],
        egress: [
            {
                protocol: "-1",
                fromPort: 0,
                toPort: 0,
                cidrBlocks: ["0.0.0.0/0"],
                ipv6CidrBlocks: ["::/0"],
                description: "All outbound",
            },
        ],
    });
}
