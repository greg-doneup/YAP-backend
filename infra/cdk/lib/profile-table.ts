// infra/cdk/lib/profile-table.ts
import { Construct } from 'constructs';
import {
  RemovalPolicy,
  Duration,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
} from 'aws-cdk-lib';

/** Props let callers turn on the GSI only when needed. */
export interface ProfileTableProps {
  /**
   * Create the XpIndex GSI (wallets ranked by XP).
   * Set to true when leaderboard features are deployed.
   * @default false
   */
  readonly withLeaderboardGsi?: boolean;
}

export class ProfileTable extends Construct {
  /** Expose the table for other stacks (e.g. IAM grants, Lambda env). */
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: ProfileTableProps = {}) {
    super(scope, id);

    // ---- base table ----
    this.table = new dynamodb.Table(this, 'Profiles', {
      tableName: 'Profiles',
      partitionKey: { name: 'walletAddress', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,   // on-demand
      pointInTimeRecovery: true,                            // PITR backup
      removalPolicy: RemovalPolicy.RETAIN,                  // keep data if stack deleted
    });

    // ---- optional GSI for XP leaderboard ----
    if (props.withLeaderboardGsi) {
      this.table.addGlobalSecondaryIndex({
        indexName: 'XpIndex',
        partitionKey: { name: 'xp', type: dynamodb.AttributeType.NUMBER },
        sortKey:     { name: 'walletAddress', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });
    }
  }

  /**
   * Helper: grant read/write access to a service’s IAM role (IRSA or Lambda).
   */
  public grantReadWrite(role: iam.IGrantable) {
    this.table.grantReadWriteData(role);
  }
}
