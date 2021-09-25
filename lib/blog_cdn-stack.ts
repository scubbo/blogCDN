import { Construct, SecretValue, Stack, StackProps } from '@aws-cdk/core'
import { PipelineProject } from '@aws-cdk/aws-codebuild'
import { Artifact } from '@aws-cdk/aws-codepipeline';
import { CodeBuildAction, GitHubSourceAction } from "@aws-cdk/aws-codepipeline-actions";
import { CdkPipeline, SimpleSynthAction } from '@aws-cdk/pipelines';
import { Secret } from "@aws-cdk/aws-secretsmanager";

export class BlogCdnStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const githubUser = this.node.tryGetContext("githubUser");
        const repo = this.node.tryGetContext("repo");
        const oAuthTokenSecretName = this.node.tryGetContext("secretName");
        console.log("Github User is " + githubUser);
        console.log("Repo is " + repo);

        const cloudAssemblyArtifact = new Artifact();
        const sourceArtifact = new Artifact();

        const sourceAction = new GitHubSourceAction({
            actionName: 'GitHub',
            output: sourceArtifact,
            branch: 'main',
            // oauthToken: SecretValue.secretsManager(oAuthTokenSecretName, {jsonField: oAuthTokenSecretName}),
            oauthToken: SecretValue.secretsManager(oAuthTokenSecretName),
            owner: githubUser,
            repo: repo
        })

        const pipelineProject = new PipelineProject(this, 'pipelineProject')

        const synthAction = new CodeBuildAction({
            actionName: 'buildAction',
            input: sourceArtifact,
            outputs: [cloudAssemblyArtifact],
            project: pipelineProject
        })

        const pipeline = new CdkPipeline(this, 'CDKPipeline', {
            cloudAssemblyArtifact,
            sourceAction,
            synthAction
        });
    }
}