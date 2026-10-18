import { Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SeatlockStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    Tags.of(this).add('project', 'seatlock');
  }
}
