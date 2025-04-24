import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ProfileTable } from './profile-table';

export class YapStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const profileTable = new ProfileTable(this, 'ProfileTable', {
      withLeaderboardGsi: false,  // enable later
    });

    // Example: grant EKS IRSA role read/write permissions
    // const eksRole = iam.Role.fromRoleArn(this, 'ProfileRole', 'arn:aws:iam::<acct>:role/yap-profile-iam-role');
    // profileTable.grantReadWrite(eksRole);
  }
}
