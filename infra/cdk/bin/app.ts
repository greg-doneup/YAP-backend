#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';
import { YapStack } from '../lib/yap-stack';   // <- the stack that includes ProfileTable, etc.

// 1. CDK app container
const app = new App();

// 2. Configure deployment environment
const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
  region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
};

// 3. Instantiate stacks
new YapStack(app, 'YapDevStack', { env });

// 4. (Optional) global tags for cost-allocation / search
Tags.of(app).add('project', 'Yap');
Tags.of(app).add('environment', 'dev');
