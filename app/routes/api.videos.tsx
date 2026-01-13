import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

// This route handles the App Proxy requests from the storefront
// URL: /apps/ugc-videos
export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log('========================================');
  console.log('🔵 APP PROXY REQUEST');
  console.log('🔵 URL:', request.url);

  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');

  console.log('🔵 Shop from query:', shop);
  console.log('========================================');

  if (!shop) {
    console.log('🔴 No shop parameter');
    return new Response(JSON.stringify({
      error: "Missing shop parameter",
      videos: []
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    console.log('🟡 Querying database for shop:', shop);

    const videos = await prisma.ugcVideo.findMany({
      where: {
        shop: shop,
        isActive: true,
      },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        videoUrl: true,
        thumbnailUrl: true,
        duration: true,
        sourceAuthor: true,
        sourceType: true,
        productId: true,
        autoplay: true,
      },
    });

    console.log('🟢 Videos found:', videos.length);

    return new Response(JSON.stringify({ videos }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("🔴 Database error:", error);

    return new Response(JSON.stringify({
      error: "Database error",
      message: error instanceof Error ? error.message : 'Unknown error',
      videos: []
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
};
