import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const videoCount = await prisma.ugcVideo.count({
    where: { shop: session.shop },
  });

  const activeVideoCount = await prisma.ugcVideo.count({
    where: { shop: session.shop, isActive: true },
  });

  return { videoCount, activeVideoCount };
};

export default function Index() {
  const { videoCount, activeVideoCount } = useLoaderData<typeof loader>();

  return (
    <s-page heading="UGC Video Manager">
      <s-button slot="primary-action" variant="primary" href="/app/videos">
        Manage Videos
      </s-button>

      <s-section heading="Dashboard">
        <s-paragraph>
          Showcase your products with short-form video content from TikTok,
          Instagram Reels, and more.
        </s-paragraph>

        <s-stack direction="inline" gap="large">
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="small" alignItems="center">
                <s-heading>{videoCount}</s-heading>
                <s-text color="subdued">Total Videos</s-text>
              </s-stack>
            </s-box>

            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="small" alignItems="center">
                <s-heading>{activeVideoCount}</s-heading>
                <s-text color="subdued">Active</s-text>
              </s-stack>
            </s-box>

            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="small" alignItems="center">
                <s-heading>{videoCount - activeVideoCount}</s-heading>
                <s-text color="subdued">Inactive</s-text>
              </s-stack>
            </s-box>
          </s-stack>
      </s-section>

      <s-section heading="Quick Start Guide">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" gap="base" alignItems="start">
              <s-badge tone="info">1</s-badge>
              <s-stack direction="block" gap="small">
                <s-text type="strong">Upload Your Videos</s-text>
                <s-text color="subdued">
                  Add short-form videos from TikTok, Instagram Reels, or your own
                  content. Videos should be in 9:16 portrait format.
                </s-text>
              </s-stack>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" gap="base" alignItems="start">
              <s-badge tone="info">2</s-badge>
              <s-stack direction="block" gap="small">
                <s-text type="strong">Add to Your Theme</s-text>
                <s-text color="subdued">
                  Open your theme customizer and add the "UGC Video Carousel" app
                  block to any section on your store.
                </s-text>
              </s-stack>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" gap="base" alignItems="start">
              <s-badge tone="info">3</s-badge>
              <s-stack direction="block" gap="small">
                <s-text type="strong">Customize & Publish</s-text>
                <s-text color="subdued">
                  Adjust colors, sizes, and spacing in the theme editor, then
                  publish to show videos on your storefront.
                </s-text>
              </s-stack>
            </s-stack>
          </s-box>
        </s-stack>

        <s-stack direction="inline" gap="base">
          <s-button href="/app/videos">Add Videos</s-button>
          <s-button
            variant="tertiary"
            href="https://help.shopify.com/en/manual/online-store/themes/theme-structure/extend/apps"
            target="_blank"
          >
            Learn about app blocks
          </s-button>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Video Specs">
        <s-unordered-list>
          <s-list-item>Format: MP4, MOV, WebM</s-list-item>
          <s-list-item>Aspect: 9:16 (vertical)</s-list-item>
          <s-list-item>Max size: 250MB</s-list-item>
          <s-list-item>Resolution: 1080x1920px</s-list-item>
          <s-list-item>Duration: 5-60 seconds</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Features">
        <s-unordered-list>
          <s-list-item>Horizontal carousel display</s-list-item>
          <s-list-item>Mobile-optimized modal player</s-list-item>
          <s-list-item>Auto-advance between videos</s-list-item>
          <s-list-item>Keyboard navigation</s-list-item>
          <s-list-item>Creator attribution</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
