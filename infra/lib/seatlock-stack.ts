import { RemovalPolicy, Stack, StackProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";

export class SeatlockStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    Tags.of(this).add("project", "seatlock");

    const vpc = this.createNetwork();
    const { dbSg } = this.createSecurityGroups(vpc);
    this.createDatabase(vpc, dbSg);
  }

  private createNetwork(): ec2.Vpc {
    return new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { cidrMask: 24, name: "public", subnetType: ec2.SubnetType.PUBLIC },
        {
          cidrMask: 24,
          name: "db",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });
  }

  private createSecurityGroups(vpc: ec2.Vpc) {
    const albSg = new ec2.SecurityGroup(this, "albSg", { vpc });
    const apiSg = new ec2.SecurityGroup(this, "apiSg", { vpc });
    const workerSg = new ec2.SecurityGroup(this, "workerSg", { vpc });
    const dbSg = new ec2.SecurityGroup(this, "dbSg", { vpc });

    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    apiSg.addIngressRule(albSg, ec2.Port.tcp(3000));
    dbSg.addIngressRule(apiSg, ec2.Port.POSTGRES);
    dbSg.addIngressRule(workerSg, ec2.Port.POSTGRES);

    return { albSg, apiSg, workerSg, dbSg } as const;
  }

  private createDatabase(vpc: ec2.Vpc, dbSg: ec2.SecurityGroup) {
    return new rds.DatabaseInstance(this, "Database", {
      vpc,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials: rds.Credentials.fromGeneratedSecret("seatlock"),
      databaseName: "seatlock",
      allocatedStorage: 20,
      publiclyAccessible: false,
      removalPolicy: RemovalPolicy.DESTROY,
      deletionProtection: false,
      storageEncrypted: true,
    });
  }
}
