import { RemovalPolicy, Stack, StackProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as path from "path";

export class SeatlockStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    Tags.of(this).add("project", "seatlock");

    const vpc = this.createNetwork();
    const { dbSg, albSg, apiSg } = this.createSecurityGroups(vpc);
    const db = this.createDatabase(vpc, dbSg);
    this.createApiService(vpc, albSg, apiSg, db);
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

  private createDatabase(
    vpc: ec2.Vpc,
    dbSg: ec2.SecurityGroup
  ): rds.DatabaseInstance {
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

  private createApiService(
    vpc: ec2.Vpc,
    albSg: ec2.SecurityGroup,
    apiSg: ec2.SecurityGroup,
    db: rds.DatabaseInstance
  ) {
    const cluster = new ecs.Cluster(this, "Cluster", { vpc });
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
    });

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      "Api",
      {
        cluster,
        loadBalancer,
        openListener: false,
        cpu: 256,
        memoryLimitMiB: 512,
        desiredCount: 1,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
        taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
        assignPublicIp: true,
        securityGroups: [apiSg],
        circuitBreaker: { rollback: true },
        minHealthyPercent: 100,
        maxHealthyPercent: 200,
        taskImageOptions: {
          image: ecs.ContainerImage.fromAsset(path.join(__dirname, "../.."), {
            file: "apps/api/Dockerfile",
            platform: Platform.LINUX_ARM64,
          }),
          containerPort: 3000,
          environment: {
            DB_HOST: db.dbInstanceEndpointAddress,
            DB_PORT: db.dbInstanceEndpointPort,
            DB_NAME: "seatlock",
            DB_SSL: "true",
          },
          secrets: {
            DB_USER: ecs.Secret.fromSecretsManager(db.secret!, "username"),
            DB_PASSWORD: ecs.Secret.fromSecretsManager(db.secret!, "password"),
          },
        },
      }
    );
    service.targetGroup.configureHealthCheck({ path: "/health" });

    return service;
  }
}
