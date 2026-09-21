/**
 * Upload an image into the merchant's own Shopify Files.
 *
 * Using Shopify Files (rather than S3/Cloudinary) keeps the app multi-tenant
 * with zero storage cost: every store's frame PNGs live in that store, served
 * from Shopify's CDN, and disappear with the store — nothing for us to host.
 *
 * Needs the write_files scope.
 */
type Admin = { graphql: (q: string, o?: any) => Promise<Response> };

export async function uploadImageToFiles(admin: Admin, file: File, alt = "") {
  const staged = await admin.graphql(
    `#graphql
    mutation Staged($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: [{
          filename: file.name || "frame.png",
          mimeType: file.type || "image/png",
          resource: "IMAGE",
          httpMethod: "POST",
          fileSize: String(file.size),
        }],
      },
    },
  );
  const stagedJson = await staged.json();
  const err = stagedJson?.data?.stagedUploadsCreate?.userErrors?.[0];
  if (err) throw new Error(err.message);
  const target = stagedJson.data.stagedUploadsCreate.stagedTargets[0];

  // Upload the bytes straight to Shopify's storage bucket.
  const body = new FormData();
  for (const p of target.parameters) body.append(p.name, p.value);
  body.append("file", file);
  const put = await fetch(target.url, { method: "POST", body });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);

  const created = await admin.graphql(
    `#graphql
    mutation Create($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus ... on MediaImage { image { url width height } } }
        userErrors { field message }
      }
    }`,
    { variables: { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", alt }] } },
  );
  const createdJson = await created.json();
  const cErr = createdJson?.data?.fileCreate?.userErrors?.[0];
  if (cErr) throw new Error(cErr.message);
  const fileId = createdJson.data.fileCreate.files[0].id as string;

  // Shopify processes the image asynchronously — poll until the URL is ready.
  for (let i = 0; i < 15; i++) {
    const res = await admin.graphql(
      `#graphql
      query F($id: ID!) { node(id: $id) { ... on MediaImage { fileStatus image { url width height } } } }`,
      { variables: { id: fileId } },
    );
    const j = await res.json();
    const node = j?.data?.node;
    if (node?.fileStatus === "READY" && node.image?.url) {
      return { fileId, url: node.image.url as string, width: node.image.width as number, height: node.image.height as number };
    }
    if (node?.fileStatus === "FAILED") throw new Error("Shopify could not process this image");
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error("Image is still processing — try saving again in a moment");
}
