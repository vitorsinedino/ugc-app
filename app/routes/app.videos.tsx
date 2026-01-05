import { useEffect, useState, useRef, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

interface UgcVideo {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  duration: number | null;
  sourceAuthor: string | null;
  sourceType: string | null;
  productId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const videos = await prisma.ugcVideo.findMany({
    where: { shop: session.shop },
    orderBy: { sortOrder: "asc" },
  });

  return { videos };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const videoUrl = formData.get("videoUrl") as string;
    const thumbnailUrl = formData.get("thumbnailUrl") as string;
    const duration = parseInt(formData.get("duration") as string) || null;
    const sourceAuthor = formData.get("sourceAuthor") as string;
    const sourceType = formData.get("sourceType") as string;
    const productId = formData.get("productId") as string;

    const maxSort = await prisma.ugcVideo.aggregate({
      where: { shop: session.shop },
      _max: { sortOrder: true },
    });

    const video = await prisma.ugcVideo.create({
      data: {
        shop: session.shop,
        title,
        description: description || null,
        videoUrl,
        thumbnailUrl: thumbnailUrl || null,
        duration,
        sourceAuthor: sourceAuthor || null,
        sourceType: sourceType || null,
        productId: productId || null,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
      },
    });

    return { success: true, video };
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await prisma.ugcVideo.delete({ where: { id } });
    return { success: true, deleted: id };
  }

  if (intent === "toggle") {
    const id = formData.get("id") as string;
    const video = await prisma.ugcVideo.findUnique({ where: { id } });
    if (video) {
      await prisma.ugcVideo.update({
        where: { id },
        data: { isActive: !video.isActive },
      });
    }
    return { success: true, toggled: id };
  }

  if (intent === "upload") {
    try {
      const filename = formData.get("filename") as string;
      const mimeType = formData.get("mimeType") as string;
      const fileSize = formData.get("fileSize") as string;

      const response = await admin.graphql(
        `#graphql
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters {
                name
                value
              }
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            input: [
              {
                filename,
                mimeType,
                httpMethod: "POST",
                resource: "VIDEO",
                fileSize,
              },
            ],
          },
        }
      );

      const responseJson = await response.json();

      if (responseJson.data?.stagedUploadsCreate?.userErrors?.length > 0) {
        console.error("Staged upload errors:", responseJson.data.stagedUploadsCreate.userErrors);
        return { error: responseJson.data.stagedUploadsCreate.userErrors[0].message };
      }

      return {
        stagedUpload: responseJson.data?.stagedUploadsCreate?.stagedTargets?.[0],
      };
    } catch (error) {
      console.error("Upload staging error:", error);
      return { error: "Failed to create staged upload" };
    }
  }

  if (intent === "createFile") {
    try {
      const resourceUrl = formData.get("resourceUrl") as string;

      const response = await admin.graphql(
        `#graphql
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              id
              alt
              ... on GenericFile {
                url
              }
              ... on Video {
                sources {
                  url
                  mimeType
                  format
                  height
                  width
                }
                preview {
                  image {
                    url
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            files: [
              {
                originalSource: resourceUrl,
                contentType: "VIDEO",
              },
            ],
          },
        }
      );

      const responseJson = await response.json();

      if (responseJson.data?.fileCreate?.userErrors?.length > 0) {
        console.error("File create errors:", responseJson.data.fileCreate.userErrors);
        return { error: responseJson.data.fileCreate.userErrors[0].message };
      }

      const file = responseJson.data?.fileCreate?.files?.[0];
      // Return the file ID so we can poll for the processed URL
      return { file, fileId: file?.id };
    } catch (error) {
      console.error("File create error:", error);
      return { error: "Failed to create file" };
    }
  }

  // Poll for video processing status
  if (intent === "pollFile") {
    try {
      const fileId = formData.get("fileId") as string;

      const response = await admin.graphql(
        `#graphql
        query getFile($id: ID!) {
          node(id: $id) {
            ... on Video {
              id
              status
              sources {
                url
                mimeType
                format
              }
              preview {
                image {
                  url
                }
              }
            }
          }
        }`,
        {
          variables: { id: fileId },
        }
      );

      const responseJson = await response.json();
      const videoNode = responseJson.data?.node;

      if (videoNode?.sources?.length > 0) {
        // Video is processed, return the CDN URL
        const mp4Source = videoNode.sources.find(
          (s: { mimeType: string }) => s.mimeType === "video/mp4"
        ) || videoNode.sources[0];

        return {
          status: "ready",
          videoUrl: mp4Source?.url,
          thumbnailUrl: videoNode.preview?.image?.url,
        };
      }

      // Still processing
      return { status: videoNode?.status || "PROCESSING" };
    } catch (error) {
      console.error("Poll file error:", error);
      return { error: "Failed to check file status" };
    }
  }

  return { error: "Unknown intent" };
};

export default function VideosPage() {
  const { videos } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modalRef = useRef<any>(null);
  const pollingRef = useRef<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastFetcherDataRef = useRef<any>(null);

  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    videoUrl: "",
    thumbnailUrl: "",
    duration: "",
    sourceAuthor: "",
    sourceType: "TikTok",
    productId: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const isLoading = fetcher.state !== "idle";

  // Handle modal visibility
  useEffect(() => {
    if (showModal && modalRef.current) {
      modalRef.current.showOverlay();
    }
  }, [showModal]);

  // Attach click listeners to Polaris web component buttons
  useEffect(() => {
    const openModal = () => setShowModal(true);

    const addBtn = document.getElementById("add-video-btn");
    const addFirstBtn = document.getElementById("add-first-video-btn");

    addBtn?.addEventListener("click", openModal);
    addFirstBtn?.addEventListener("click", openModal);

    // Event delegation for toggle/delete buttons
    const handleVideoAction = (e: Event) => {
      const target = e.target as HTMLElement;
      const button = target.closest("[data-action]") as HTMLElement;
      if (!button) return;

      const action = button.dataset.action;
      const videoId = button.dataset.videoId;
      if (!videoId) return;

      if (action === "toggle") {
        const toggleData = new FormData();
        toggleData.append("intent", "toggle");
        toggleData.append("id", videoId);
        fetcher.submit(toggleData, { method: "POST" });
      } else if (action === "delete") {
        if (confirm("Are you sure you want to delete this video?")) {
          const deleteData = new FormData();
          deleteData.append("intent", "delete");
          deleteData.append("id", videoId);
          fetcher.submit(deleteData, { method: "POST" });
        }
      }
    };

    document.addEventListener("click", handleVideoAction);

    return () => {
      addBtn?.removeEventListener("click", openModal);
      addFirstBtn?.removeEventListener("click", openModal);
      document.removeEventListener("click", handleVideoAction);
    };
  }, [videos.length, fetcher]);

  // Attach click listeners for modal buttons
  useEffect(() => {
    if (!showModal) return;

    const handleCancel = () => {
      setShowModal(false);
      resetForm();
      modalRef.current?.hideOverlay();
    };

    const handleSubmitClick = () => {
      handleSubmit();
    };

    const handleRemoveFile = (e: Event) => {
      e.stopPropagation();
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    // Small delay to ensure modal is rendered
    const timeoutId = setTimeout(() => {
      const cancelBtn = document.getElementById("modal-cancel-btn");
      const submitBtn = document.getElementById("modal-submit-btn");
      const removeBtn = document.getElementById("remove-file-btn");

      cancelBtn?.addEventListener("click", handleCancel);
      submitBtn?.addEventListener("click", handleSubmitClick);
      removeBtn?.addEventListener("click", handleRemoveFile);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      const cancelBtn = document.getElementById("modal-cancel-btn");
      const submitBtn = document.getElementById("modal-submit-btn");
      const removeBtn = document.getElementById("remove-file-btn");
      cancelBtn?.removeEventListener("click", handleCancel);
      submitBtn?.removeEventListener("click", handleSubmitClick);
      removeBtn?.removeEventListener("click", handleRemoveFile);
    };
  }, [showModal, selectedFile]);

  useEffect(() => {
    if (fetcher.data && "success" in fetcher.data && fetcher.data.success) {
      if ("video" in fetcher.data) {
        shopify.toast.show("Video added successfully");
        setShowModal(false);
        resetForm();
        modalRef.current?.hideOverlay();
      } else if ("deleted" in fetcher.data) {
        shopify.toast.show("Video deleted");
      } else if ("toggled" in fetcher.data) {
        shopify.toast.show("Video status updated");
      }
    }
  }, [fetcher.data, shopify]);

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      videoUrl: "",
      thumbnailUrl: "",
      duration: "",
      sourceAuthor: "",
      sourceType: "TikTok",
      productId: "",
    });
    setSelectedFile(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const validateAndSetFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("video/")) {
        shopify.toast.show("Please select a video file", { isError: true });
        return false;
      }

      if (file.size > 250 * 1024 * 1024) {
        shopify.toast.show("File size must be less than 250MB", {
          isError: true,
        });
        return false;
      }

      setSelectedFile(file);
      setFormData((prev) => ({
        ...prev,
        title: prev.title || file.name.replace(/\.[^/.]+$/, ""),
      }));
      return true;
    },
    [shopify]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        validateAndSetFile(file);
      }
    },
    [validateAndSetFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Store upload state for multi-step process
  const [pendingUpload, setPendingUpload] = useState<{
    stage: "idle" | "staging" | "uploading" | "creating" | "polling";
    file: File | null;
    fileId?: string;
    pollCount?: number;
  }>({ stage: "idle", file: null });

  // Handle fetcher responses for upload flow
  useEffect(() => {
    if (!fetcher.data || pendingUpload.stage === "idle") return;

    // Prevent processing the same response twice
    if (lastFetcherDataRef.current === fetcher.data) return;
    lastFetcherDataRef.current = fetcher.data;

    if (pendingUpload.stage === "staging" && "stagedUpload" in fetcher.data) {
      const stagedUpload = fetcher.data.stagedUpload;
      if (stagedUpload && pendingUpload.file) {
        // Now upload the file to the staged URL
        setPendingUpload((prev) => ({ ...prev, stage: "uploading" }));

        const uploadFormData = new FormData();
        stagedUpload.parameters.forEach((param: { name: string; value: string }) => {
          uploadFormData.append(param.name, param.value);
        });
        uploadFormData.append("file", pendingUpload.file);

        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            // File uploaded, now create the file in Shopify
            setPendingUpload((prev) => ({
              ...prev,
              stage: "creating",
            }));

            const createData = new FormData();
            createData.append("intent", "createFile");
            createData.append("resourceUrl", stagedUpload.resourceUrl);
            fetcher.submit(createData, { method: "POST" });
          } else {
            shopify.toast.show("Upload failed. Please try again.", { isError: true });
            setUploading(false);
            setPendingUpload({ stage: "idle", file: null });
          }
        };

        xhr.onerror = () => {
          shopify.toast.show("Upload failed. Please try again.", { isError: true });
          setUploading(false);
          setPendingUpload({ stage: "idle", file: null });
        };

        xhr.open("POST", stagedUpload.url);
        xhr.send(uploadFormData);
      }
    } else if (pendingUpload.stage === "creating" && "fileId" in fetcher.data) {
      // File created, now poll for the processed video URL
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = fetcher.data as any;
      const fileId = data.fileId;

      if (fileId) {
        // Check if sources are already available
        const file = data.file;
        if (file?.sources?.length > 0) {
          // Video is already processed
          const mp4Source = file.sources.find(
            (s: { mimeType: string }) => s.mimeType === "video/mp4"
          ) || file.sources[0];

          const submitData = new FormData();
          submitData.append("intent", "create");
          submitData.append("title", formData.title);
          submitData.append("description", formData.description);
          submitData.append("videoUrl", mp4Source.url);
          submitData.append("thumbnailUrl", file.preview?.image?.url || "");
          submitData.append("duration", formData.duration);
          submitData.append("sourceAuthor", formData.sourceAuthor);
          submitData.append("sourceType", formData.sourceType);
          submitData.append("productId", formData.productId);

          fetcher.submit(submitData, { method: "POST" });
          setUploading(false);
          setPendingUpload({ stage: "idle", file: null });
        } else {
          // Start polling for processed URL
          pollingRef.current = true;
          setPendingUpload((prev) => ({
            ...prev,
            stage: "polling",
            fileId,
            pollCount: 0,
          }));

          // Wait 3 seconds before first poll
          setTimeout(() => {
            if (pollingRef.current) {
              const pollData = new FormData();
              pollData.append("intent", "pollFile");
              pollData.append("fileId", fileId);
              fetcher.submit(pollData, { method: "POST" });
            }
          }, 3000);
        }
      }
    } else if (pendingUpload.stage === "polling" && "status" in fetcher.data && !("fileId" in fetcher.data)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = fetcher.data as any;

      if (data.status === "ready" && data.videoUrl) {
        // Video is processed, create the record
        pollingRef.current = false;
        const submitData = new FormData();
        submitData.append("intent", "create");
        submitData.append("title", formData.title);
        submitData.append("description", formData.description);
        submitData.append("videoUrl", data.videoUrl);
        submitData.append("thumbnailUrl", data.thumbnailUrl || "");
        submitData.append("duration", formData.duration);
        submitData.append("sourceAuthor", formData.sourceAuthor);
        submitData.append("sourceType", formData.sourceType);
        submitData.append("productId", formData.productId);

        fetcher.submit(submitData, { method: "POST" });
        setUploading(false);
        setPendingUpload({ stage: "idle", file: null });
      } else if (data.status !== "ready" && pollingRef.current) {
        // Still processing, poll again (max 60 attempts = ~3 minutes)
        const pollCount = (pendingUpload.pollCount || 0) + 1;
        if (pollCount < 60) {
          setPendingUpload((prev) => ({ ...prev, pollCount }));

          setTimeout(() => {
            if (pollingRef.current && pendingUpload.fileId) {
              const pollData = new FormData();
              pollData.append("intent", "pollFile");
              pollData.append("fileId", pendingUpload.fileId);
              fetcher.submit(pollData, { method: "POST" });
            }
          }, 3000);
        } else {
          pollingRef.current = false;
          shopify.toast.show("Video processing timed out. The video may still be processing - check back in a few minutes.", { isError: true });
          setUploading(false);
          setPendingUpload({ stage: "idle", file: null });
        }
      }
    } else if ("error" in fetcher.data) {
      pollingRef.current = false;
      shopify.toast.show(fetcher.data.error as string, { isError: true });
      setUploading(false);
      setPendingUpload({ stage: "idle", file: null });
    }
  }, [fetcher.data, pendingUpload.stage, pendingUpload.file, pendingUpload.fileId, pendingUpload.pollCount, shopify, formData]);

  const startUpload = () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);
    setPendingUpload({ stage: "staging", file: selectedFile });

    const stagedData = new FormData();
    stagedData.append("intent", "upload");
    stagedData.append("filename", selectedFile.name);
    stagedData.append("mimeType", selectedFile.type);
    stagedData.append("fileSize", selectedFile.size.toString());

    fetcher.submit(stagedData, { method: "POST" });
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    // If there's a file to upload, start the upload flow
    if (selectedFile) {
      startUpload();
      return;
    }

    // Otherwise, submit with just the video URL
    if (!formData.videoUrl) {
      shopify.toast.show("Please provide a video URL or upload a file", {
        isError: true,
      });
      return;
    }

    const submitData = new FormData();
    submitData.append("intent", "create");
    submitData.append("title", formData.title);
    submitData.append("description", formData.description);
    submitData.append("videoUrl", formData.videoUrl);
    submitData.append("thumbnailUrl", formData.thumbnailUrl);
    submitData.append("duration", formData.duration);
    submitData.append("sourceAuthor", formData.sourceAuthor);
    submitData.append("sourceType", formData.sourceType);
    submitData.append("productId", formData.productId);

    fetcher.submit(submitData, { method: "POST" });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const handleModalHide = () => {
    setShowModal(false);
    resetForm();
  };

  return (
    <s-page heading="UGC Videos">
      <s-button slot="primary-action" variant="primary" id="add-video-btn">
        Add Video
      </s-button>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm"
        onChange={handleFileInputChange}
        style={{ display: "none" }}
      />

      <s-section heading={`${videos.length} video${videos.length !== 1 ? "s" : ""} uploaded`}>
        {videos.length === 0 ? (
          <s-box padding="large" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-text color="subdued">No videos added yet</s-text>
              <s-paragraph>
                Upload short-form videos to display on your storefront.
              </s-paragraph>
              <s-button id="add-first-video-btn">
                Add your first video
              </s-button>
            </s-stack>
          </s-box>
        ) : (
          <s-stack direction="block" gap="base">
            {videos.map((video: UgcVideo) => (
              <s-box key={video.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="inline" gap="base" alignItems="center">
                  <div
                    style={{
                      width: "56px",
                      height: "100px",
                      borderRadius: "8px",
                      overflow: "hidden",
                      backgroundColor: "#f1f1f1",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {video.thumbnailUrl ? (
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#999"
                        strokeWidth="2"
                      >
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    )}
                  </div>

                  <s-box>
                    <s-stack direction="block" gap="small">
                      <s-stack direction="inline" gap="small" alignItems="center">
                        <s-text type="strong">{video.title}</s-text>
                        <s-badge tone={video.isActive ? "success" : "neutral"}>
                          {video.isActive ? "Active" : "Inactive"}
                        </s-badge>
                      </s-stack>

                      <s-stack direction="inline" gap="base">
                        {video.sourceAuthor && (
                          <s-text color="subdued">
                            {video.sourceType}: {video.sourceAuthor}
                          </s-text>
                        )}
                        {video.duration && (
                          <s-text color="subdued">
                            {video.duration}s
                          </s-text>
                        )}
                      </s-stack>
                    </s-stack>
                  </s-box>

                  <s-stack direction="inline" gap="small">
                    <s-button
                      variant="tertiary"
                      data-action="toggle"
                      data-video-id={video.id}
                    >
                      {video.isActive ? "Disable" : "Enable"}
                    </s-button>
                    <s-button
                      variant="tertiary"
                      tone="critical"
                      data-action="delete"
                      data-video-id={video.id}
                    >
                      Delete
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Video Requirements">
        <s-unordered-list>
          <s-list-item>Format: MP4, MOV, WebM</s-list-item>
          <s-list-item>Aspect ratio: 9:16</s-list-item>
          <s-list-item>Max size: 250MB</s-list-item>
          <s-list-item>Duration: 5-60 seconds</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Theme Setup">
        <s-paragraph>
          After adding videos, open your theme customizer and add the "UGC Video
          Carousel" app block to display them on your storefront.
        </s-paragraph>
        <s-button
          variant="tertiary"
          href="https://help.shopify.com/en/manual/online-store/themes/theme-structure/extend/apps"
          target="_blank"
        >
          Learn more
        </s-button>
      </s-section>

      {showModal && (
        <s-modal
          ref={modalRef}
          heading="Add UGC Video"
          onHide={handleModalHide}
        >
          <s-stack direction="block" gap="base">
            {/* Dropzone */}
            <div
              onClick={triggerFileInput}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              style={{
                border: `2px dashed ${isDragging ? "#008060" : "#c9cccf"}`,
                borderRadius: "8px",
                padding: "24px",
                textAlign: "center",
                cursor: "pointer",
                backgroundColor: isDragging ? "#f0fdf4" : "#fafbfb",
                transition: "all 0.2s ease",
              }}
            >
              {selectedFile ? (
                <s-stack direction="block" gap="small" alignItems="center">
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#008060"
                    strokeWidth="2"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <s-text type="strong">{selectedFile.name}</s-text>
                  <s-text color="subdued">
                    {formatFileSize(selectedFile.size)}
                  </s-text>
                  <s-button
                    variant="tertiary"
                    id="remove-file-btn"
                  >
                    Remove
                  </s-button>
                </s-stack>
              ) : (
                <s-stack direction="block" gap="small" alignItems="center">
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#637381"
                    strokeWidth="2"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <s-text type="strong">
                    Click to upload or drag and drop
                  </s-text>
                  <s-text color="subdued">
                    MP4, MOV, or WebM (max 250MB)
                  </s-text>
                </s-stack>
              )}
            </div>

            {uploading && (
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="small">
                  <s-stack direction="inline" gap="base">
                    <s-text>
                      {pendingUpload.stage === "polling"
                        ? `Processing video... (${Math.round(((pendingUpload.pollCount || 0) / 60) * 100)}%)`
                        : pendingUpload.stage === "creating"
                        ? "Creating file..."
                        : "Uploading..."}
                    </s-text>
                    {pendingUpload.stage !== "polling" && pendingUpload.stage !== "creating" && (
                      <s-text>{uploadProgress}%</s-text>
                    )}
                  </s-stack>
                  <s-box background="subdued" borderRadius="base">
                    <div
                      style={{
                        height: "4px",
                        width: pendingUpload.stage === "polling" || pendingUpload.stage === "creating"
                          ? "100%"
                          : `${uploadProgress}%`,
                        backgroundColor: "#008060",
                        borderRadius: "4px",
                        transition: "width 0.3s ease",
                        animation: pendingUpload.stage === "polling" ? "pulse 1.5s infinite" : "none",
                      }}
                    />
                  </s-box>
                </s-stack>
              </s-box>
            )}

            <s-text color="subdued">
              Or paste a direct video URL:
            </s-text>

            <s-text-field
              label="Video URL"
              value={formData.videoUrl}
              onChange={(e: Event) => {
                const target = e.target as HTMLInputElement;
                setFormData((prev) => ({ ...prev, videoUrl: target.value }));
              }}
              placeholder="https://example.com/video.mp4"
              disabled={!!selectedFile}
            />

            <s-text-field
              label="Title"
              value={formData.title}
              onChange={(e: Event) => {
                const target = e.target as HTMLInputElement;
                setFormData((prev) => ({ ...prev, title: target.value }));
              }}
              required
            />

            <s-text-field
              label="Thumbnail URL (optional)"
              value={formData.thumbnailUrl}
              onChange={(e: Event) => {
                const target = e.target as HTMLInputElement;
                setFormData((prev) => ({
                  ...prev,
                  thumbnailUrl: target.value,
                }));
              }}
              placeholder="https://example.com/thumbnail.jpg"
            />

            <s-stack direction="inline" gap="base">
              <s-text-field
                label="Duration (seconds)"
                value={formData.duration}
                onChange={(e: Event) => {
                  const target = e.target as HTMLInputElement;
                  setFormData((prev) => ({ ...prev, duration: target.value }));
                }}
              />

              <s-select
                label="Source"
                value={formData.sourceType}
                onChange={(e: Event) => {
                  const target = e.target as HTMLSelectElement;
                  setFormData((prev) => ({
                    ...prev,
                    sourceType: target.value,
                  }));
                }}
              >
                <s-option value="TikTok">TikTok</s-option>
                <s-option value="Instagram">Instagram</s-option>
                <s-option value="YouTube">YouTube</s-option>
                <s-option value="Original">Original</s-option>
              </s-select>
            </s-stack>

            <s-text-field
              label="Creator Handle (optional)"
              value={formData.sourceAuthor}
              onChange={(e: Event) => {
                const target = e.target as HTMLInputElement;
                setFormData((prev) => ({
                  ...prev,
                  sourceAuthor: target.value,
                }));
              }}
              placeholder="@username"
            />
          </s-stack>

          <s-stack slot="footer" direction="inline" gap="base" justifyContent="end">
            <s-button
              variant="tertiary"
              id="modal-cancel-btn"
            >
              Cancel
            </s-button>
            <s-button
              id="modal-submit-btn"
              loading={isLoading || uploading}
            >
              {uploading
                ? pendingUpload.stage === "polling"
                  ? "Processing..."
                  : "Uploading..."
                : "Add Video"}
            </s-button>
          </s-stack>
        </s-modal>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
