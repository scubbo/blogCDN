#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { BlogCdnStack } from '../lib/blog_cdn-stack';

const app = new cdk.App();
new BlogCdnStack(app, 'BlogCdnStack');
