#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { SeatlockStack } from "../lib/seatlock-stack";

const app = new App();

new SeatlockStack(app, "Seatlock-Dev", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "ap-southeast-1",
  },
});
