import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ProfileTable } from './profile-table';

// Define environment properties with your AWS account and region
interface YAPStackProps extends StackProps {
  env?: {
    account?: string;
    region?: string;
  };
}

export class YAPStack extends Stack {
  constructor(scope: Construct, id: string, props?: YAPStackProps) {
    super(scope, id, props);

    const isLocalDev = props?.env?.account === 'local-development';

    // Create resources based on environment
    if (isLocalDev) {
      console.log('Running in local development mode - will only synthesize CloudFormation template');
    }

    const profileTable = new ProfileTable(this, 'ProfileTable', {
      withLeaderboardGsi: false,  // enable later
    });

    // Example: grant EKS IRSA role read/write permissions
    // const eksRole = iam.Role.fromRoleArn(this, 'ProfileRole', 'arn:aws:iam::<acct>:role/yap-profile-iam-role');
    // profileTable.grantReadWrite(eksRole);
  }
}
