import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as BlogCdn from '../lib/blog_cdn-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new BlogCdn.BlogCdnStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
