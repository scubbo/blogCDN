import { Construct, SecretValue, Stack, StackProps } from '@aws-cdk/core'
import { BuildSpec, PipelineProject } from '@aws-cdk/aws-codebuild'
import { Artifact } from '@aws-cdk/aws-codepipeline';
import { CodeBuildAction, GitHubSourceAction, S3DeployAction } from "@aws-cdk/aws-codepipeline-actions";
import { CdkPipeline, SimpleSynthAction } from '@aws-cdk/pipelines';
import { Bucket } from "@aws-cdk/aws-s3";
import { Secret } from "@aws-cdk/aws-secretsmanager";

export class BlogCdnStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const sourceArtifact = new Artifact();
    const cloudAssemblyArtifact = new Artifact();
    const stackArtifact = new Artifact();

    const sourceAction = new GitHubSourceAction({
      actionName: 'GitHub',
      output: sourceArtifact,
      branch: 'basicPipeline',
      oauthToken: SecretValue.secretsManager('blogCDNOAuthToken'),
      owner: 'scubbo',
      repo: 'basicPipeline'
    })

    const selfMutateSynthAction = SimpleSynthAction.standardNpmSynth({
      sourceArtifact,
      cloudAssemblyArtifact,
      buildCommand: 'npm run build',
      environment: {
          privileged: true
      }
    })

    const pipeline = new CdkPipeline(this, 'CDKPipeline', {
      cloudAssemblyArtifact,
      sourceAction,
      synthAction: selfMutateSynthAction,
      // deployToS3Action
    });
  }
}
