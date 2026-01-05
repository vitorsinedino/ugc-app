import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// This route handles the App Proxy requests from the storefront
// URL: /apps/ugc-videos or similar configured in shopify.app.toml
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authenticate the app proxy request
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    // Fetch active videos for this shop
    const videos = await prisma.ugcVideo.findMany({
      where: {
        shop: session.shop,
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
      },
    });

    return new Response(JSON.stringify({ videos }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60", // Cache for 60 seconds
      },
    });
  } catch (error) {
    console.error("Error fetching videos:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
};
