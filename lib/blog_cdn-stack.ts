import { Construct, SecretValue, Stack, StackProps } from '@aws-cdk/core'
import { BuildSpec, PipelineProject } from '@aws-cdk/aws-codebuild'
import { Artifact } from '@aws-cdk/aws-codepipeline';
import { CodeBuildAction, GitHubSourceAction, S3DeployAction } from "@aws-cdk/aws-codepipeline-actions";
import { CdkPipeline, SimpleSynthAction } from '@aws-cdk/pipelines';
import { Bucket } from "@aws-cdk/aws-s3";
import { Secret } from "@aws-cdk/aws-secretsmanager";

export class BlogCdnStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

      const githubUser = this.node.tryGetContext("githubUser");
      const repo = this.node.tryGetContext("repo");
      const oAuthTokenSecretName = this.node.tryGetContext("secretName");
      console.log("Github User is " + githubUser);
      console.log("Repo is " + repo);

      const sourceArtifact = new Artifact();
      const cloudAssemblyArtifact = new Artifact();
      const stackArtifact = new Artifact();

      const sourceAction = new GitHubSourceAction({
          actionName: 'GitHub',
          output: sourceArtifact,
          branch: 'basicPipeline',
          oauthToken: SecretValue.secretsManager(oAuthTokenSecretName),
          owner: githubUser,
          repo: repo
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
