import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { WorkstationConfig } from "./config";

export interface ComputeResources {
    instance: aws.ec2.Instance;
    eip: aws.ec2.Eip;
    eipAssoc: aws.ec2.EipAssociation;
}

export function createCompute(
    cfg: WorkstationConfig,
    sg: aws.ec2.SecurityGroup,
    profile: aws.iam.InstanceProfile,
    userData: pulumi.Output<string>,
): ComputeResources {
    const ami = aws.ec2.getAmi({
        mostRecent: true,
        owners: ["099720109477"], // Canonical
        filters: [
            {
                name: "name",
                values: [
                    "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*",
                ],
            },
            { name: "architecture", values: ["x86_64"] },
            { name: "virtualization-type", values: ["hvm"] },
        ],
    });

    const instance = new aws.ec2.Instance("workstation", {
        ami: ami.then(a => a.id),
        instanceType: cfg.instanceType as aws.ec2.InstanceType,
        vpcSecurityGroupIds: [sg.id],
        iamInstanceProfile: profile.name,
        userData: userData,
        userDataReplaceOnChange: false,
        rootBlockDevice: {
            volumeType: "gp3",
            volumeSize: cfg.ebsSizeGb,
            deleteOnTermination: true,
        },
        tags: {
            Name: "ai-workstation",
            ManagedBy: "pulumi",
        },
    });

    const eip = new aws.ec2.Eip("workstation-eip", {
        domain: "vpc",
        tags: { Name: "ai-workstation-eip" },
    });

    const eipAssoc = new aws.ec2.EipAssociation("workstation-eip-assoc", {
        instanceId: instance.id,
        allocationId: eip.allocationId,
    });

    return { instance, eip, eipAssoc };
}
