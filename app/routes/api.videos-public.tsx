import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

// DEVELOPMENT ONLY - Public endpoint without authentication
// Use this for testing when app proxy isn't working
// URL: /api/videos-public
export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log('🔵 Public API request received:', request.url);
  
  try {
    // For development, use a hardcoded shop or get it from query params
    const url = new URL(request.url);
    const shop = url.searchParams.get('shop') || 'frontend-test-sinedino.myshopify.com';
    
    console.log('🟢 Shop (dev mode):', shop);

    // Fetch active videos for this shop
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
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error('🔴 Error:', error);
    return new Response(
      JSON.stringify({ 
        error: "Failed to fetch videos",
        details: error instanceof Error ? error.message : String(error)
      }), 
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
};

// Handle OPTIONS for CORS
export const OPTIONS = () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
