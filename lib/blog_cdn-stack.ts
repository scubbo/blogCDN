import * as cdk from '@aws-cdk/core'
import {Construct, Stack, StackProps} from '@aws-cdk/core'
import {BuildSpec} from '@aws-cdk/aws-codebuild';
import {S3DeployAction} from "@aws-cdk/aws-codepipeline-actions";
import {
  CodeBuildStep,
  CodePipeline,
  CodePipelineActionFactoryResult,
  CodePipelineSource,
  FileSet,
  ICodePipelineActionFactory,
  ProduceActionOptions,
  Step,
} from '@aws-cdk/pipelines';
import {DnsValidatedCertificate} from "@aws-cdk/aws-certificatemanager";
import {
  Distribution,
  experimental,
  LambdaEdgeEventType,
  ViewerProtocolPolicy
} from "@aws-cdk/aws-cloudfront";
import {IStage} from "@aws-cdk/aws-codepipeline";
import {PolicyStatement} from "@aws-cdk/aws-iam";
import {Code, Runtime} from "@aws-cdk/aws-lambda";
import {ARecord, HostedZone, RecordTarget} from "@aws-cdk/aws-route53";
import {Bucket} from "@aws-cdk/aws-s3";
import {BucketDeployment, Source} from "@aws-cdk/aws-s3-deployment";
import {StringParameter} from "@aws-cdk/aws-ssm";
import {S3Origin} from "@aws-cdk/aws-cloudfront-origins";
import {CloudFrontTarget} from "@aws-cdk/aws-route53-targets";

const originalBucketParameterName = "hugo-bucket-name";
const intermediateUploadKey = 'intermediate-upload';

export class BlogCdnStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const user = this.node.tryGetContext("user");
    const infraRepo = this.node.tryGetContext("infraRepo");
    const contentRepo = this.node.tryGetContext("contentRepo");
    const branch = this.node.tryGetContext("branch") ?? 'main';
    // intentionally no branch-variable for content - assume always `main`
    // (use drafts if you wanna experiment!)
    const secretName = this.node.tryGetContext("secretName");
    const hostedZoneDomainName = this.node.tryGetContext("hostedZoneDomainName");
    const domainRecord = this.node.tryGetContext("domainRecord");
    const machineUserPrivateKeyParameterName = this.node.tryGetContext("machineUserPrivateKeyParameterName") ?? 'Github-Machine-User-Private-Key';
    const machineUserPublicKeyParameterName = this.node.tryGetContext("machineUserPublicKeyParameterName") ?? 'Github-Machine-User-Public-Key';


    // https://cdkworkshop.com/20-typescript/70-advanced-topics/200-pipelines/3000-new-pipeline.html
    let gitHubSourceInput = CodePipelineSource.gitHub(`${user}/${infraRepo}`, branch, {
      authentication: cdk.SecretValue.secretsManager(secretName),
    });
    let blogContentSourceInput = CodePipelineSource.gitHub(`${user}/${contentRepo}`, 'main', {
      authentication: cdk.SecretValue.secretsManager(secretName)
    });
    const infraCodeBuildStep = new CodeBuildStep('SynthStep', {
        input: gitHubSourceInput,
        additionalInputs: {blogContent: blogContentSourceInput},
        installCommands: [
          // Infra synth installation
          'npm install -g aws-cdk',

          // Hugo build installation
          // https://stackoverflow.com/a/68603359/1040915
          'rm -f /etc/apt/sources.list.d/sbt.list',
          // https://askubuntu.com/a/1313279/284800, but without `sudo`
          'curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -',
          // Next 4 lines - https://aws.amazon.com/blogs/infrastructure-and-automation/building-a-ci-cd-pipeline-for-hugo-websites/
          'apt-get update',
          'echo Installing hugo',
          'curl -L -o hugo.deb https://github.com/gohugoio/hugo/releases/download/v0.91.2/hugo_extended_0.91.2_Linux-64bit.deb',
          'dpkg -i hugo.deb'
        ],
        commands: [
          // First, synthesize the infra...
          'npm ci',
          'npm run build',
          `npx cdk synth --context user=${user} --context infraRepo=${infraRepo} --context contentRepo=${contentRepo} --context branch=${branch} --context secretName=${secretName} --context hostedZoneDomainName=${hostedZoneDomainName} --context domainRecord=${domainRecord} --context machineUserPrivateKeyParameterName=${machineUserPrivateKeyParameterName} --context machineUserPublicKeyParameterName=${machineUserPublicKeyParameterName}`,

          // Then, build statically-hostable content with Hugo
          //
          // See https://medium.com/@cristiano.ventura/working-with-git-submodules-in-codepipeline-83e843e5d0a -
          // CodePipelines does not natively pull in submodules, so we need to actively pull in the `.git` folder to fetch them
          'mkdir -p ~/.ssh',
          'echo "$ssh_key" > ~/.ssh/id_rsa',
          'echo "$ssh_pub" > ~/.ssh/id_rsa.pub',
          'chmod 600 ~/.ssh/id_rsa',
          'eval "$(ssh-agent -s)"',
          'cd blogContent',
          'git init',
          'git remote add origin "$git_url"',
          'git fetch origin',
          // TODO: I would like to use something like `$CODEBUILD_RESOLVED_SOURCE_VERSION_blogContent` here, but that env variable doesn't seem to exist.
          // Could maybe use https://stackoverflow.com/questions/67828854/how-to-get-commit-id-of-secondary-source-in-codepipeline
          // or https://stackoverflow.com/questions/47264793/getting-commit-id-in-codepipeline to do so? Can't see how to define variables
          // for `CodePipelineSource`s, though.
          'git reset --hard origin/main',
          'git submodule init',
          'git submodule update --recursive',
          'cd ..', // pushd/popd doesn't seem to work in a CodeBuild context
          'find -L blogContent/blog', // Here we should now see the themes subfolders populated!
          'HUGO_ENV=production',
          'hugo -v --source blogContent/blog'
        ],
        // https://github.com/aws/aws-cdk/issues/17224
        partialBuildSpec: BuildSpec.fromObject({
          version: 0.2,
          env: {
            shell: 'bash',
            'parameter-store': {
              ssh_key: machineUserPrivateKeyParameterName,
              ssh_pub: machineUserPublicKeyParameterName
            },
            variables: {
              git_url: `git@github.com:${user}/${contentRepo}.git`
            }
          },
        }),

        // https://stackoverflow.com/a/69579891/1040915
        rolePolicyStatements: [
          new PolicyStatement({
            actions: ['sts:AssumeRole'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'iam:ResourceTag/aws-cdk:bootstrap-role': 'lookup',
              },
            },
          }),
          new PolicyStatement({
            actions: ['ssm:GetParameters'],
            resources: [machineUserPrivateKeyParameterName, machineUserPublicKeyParameterName]
              .map((param_name) => `arn:aws:ssm:${props?.env?.region}:${props?.env?.account}:parameter/${param_name}`)
          })
        ]
      }
    )
    const blogContentFileSet = infraCodeBuildStep.addOutputDirectory('blogContent/blog/public');

    const pipeline = new CodePipeline(this, 'pipeline', {
      synth: infraCodeBuildStep,
    });

    const originalBucket = new Bucket(this, 'OriginalBucket');

    // Cannot take direct cross-stage dependency on bucket -
    // https://medium.com/swlh/aws-cdk-pipelines-real-world-tips-and-tricks-part-1-544601c3e90b
    new StringParameter(this, 'hugoBucketNameParameter', {
      parameterName: originalBucketParameterName,
      description: 'Name of Hugo Bucket',
      stringValue: originalBucket.bucketName
    })

    const stage = pipeline.addStage(new DeploymentStage(this, 'deploymentStage', {
      hostedZoneDomainName,
      domainRecord,
      hostedSiteS3Prefix: 'hostedSite',
      // TODO: is it worth introducing the ability to deploy to different envs? (Probably not :P )
      env: props?.env
    }));
    stage.addPre(new PreCopyStep(blogContentFileSet, originalBucket));

  }
}

class PreCopyStep extends Step implements ICodePipelineActionFactory {
  constructor(private readonly input: FileSet, private readonly bucket: Bucket) {
    super('PreCopyStep');
    this.input = input;
    this.bucket = bucket;
  }

  public produceAction(stage: IStage, options: ProduceActionOptions): CodePipelineActionFactoryResult {

    stage.addAction(new S3DeployAction({
      actionName: 'S3Deploy',
      bucket: this.bucket,
      extract: false,
      input: options.artifacts.toCodePipeline(this.input),
      objectKey: intermediateUploadKey,
      runOrder: options.runOrder,
    }));

    return { runOrdersConsumed: 1 };
  }
}

interface DeploymentStageProps extends cdk.StageProps {
  hostedZoneDomainName: string,
  domainRecord: string
  hostedSiteS3Prefix: string, // The S3 prefix where the unzipped site files will be deployed to
}

class DeploymentStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: DeploymentStageProps) {
    super(scope, id, props);

    new DeploymentStack(this, 'DeploymentStage', props);

  }
}

interface DeploymentStackProps extends cdk.StackProps {
  // TODO - it seems really awkward to have to repeat the definition of these properties
  // in both StageProps and StackProps. Is there a better pattern?
  //
  // I guess you could extract properties to a configuration file and simply reference them
  // by an env-identifier (`beta`, `prod`, etc.)?
  hostedZoneDomainName: string,
  domainRecord: string
  hostedSiteS3Prefix: string, // The S3 prefix where the unzipped site files will be deployed to
}

class DeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DeploymentStackProps) {
    super(scope, id, props);

    const domainName = props.hostedZoneDomainName;
    const domainRecord = props.domainRecord;
    const fullDomainName = `${domainRecord}.${domainName}`;

    const originalBucket = Bucket.fromBucketName(this, 'originalBucketInStage',
      StringParameter.fromStringParameterName(
        this, 'originalBucketNameParameter', originalBucketParameterName).stringValue);
    const finalBucket = new Bucket(this, 'finalBucket');

    const zone = HostedZone.fromLookup(this, 'baseZone', {
      domainName: domainName
    })
    const certificate = new DnsValidatedCertificate(this, 'mySiteCert', {
      domainName: fullDomainName,
      hostedZone: zone,
    });
    let distribution = new Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new S3Origin(finalBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        edgeLambdas: [
          {
            eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
            functionVersion: new experimental.EdgeFunction(this, 'EdgeFunction', {
              runtime: Runtime.NODEJS_14_X,
              code: Code.fromAsset('lambda'),
              handler: 'index_html_translation.handler'
            })
          },
          {
            eventType: LambdaEdgeEventType.VIEWER_RESPONSE,
            functionVersion: new experimental.EdgeFunction(this, 'GnuTerryEdgeFunction', {
              runtime: Runtime.NODEJS_14_X,
              code: Code.fromAsset('lambda'),
              handler: 'gnu_terry.handler'
            })
          }
        ]
      },
      domainNames: [fullDomainName],
      certificate: certificate,
    });

    new BucketDeployment(this, 'BucketDeployment', {
      destinationBucket: finalBucket,
      distribution: distribution,
      metadata: {
        // Necessary because, under the hood, a BucketDeployment is a CustomResource calling a,
        // Lambda, and that only gets called if the the Resource itself is updated. Without new
        // metadata every time, the CustomResource will never be updated.
        // An alternative would be to have a different intermediateUploadKey every time (perhaps
        // with the date encoded into it), but that is wasteful in storage unless they're then
        // cleaned up
        date: Date.now().toString()
      },
      sources: [Source.bucket(originalBucket, intermediateUploadKey)],
    });
    new ARecord(this, 'ARecord', {
      zone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      recordName: domainRecord
    })
  }
}