# dvwebloader
A web tool for uploading folders of files to a Dataverse dataset. See [the wiki](https://github.com/gdcc/dvwebloader/wiki) for further details.

The Hosted version at https://gdcc.github.io/dvwebloader can be used for testing. You should fork or install a local copy for production use (to avoid changes made in this repository immediately being available from your Dataverse installation.)
You may also want to run the localinstall.sh script in the directory you download to to make and local copies of the libraries used.

## DVWebloader Versions

### V1 (Original)
- **File**: `src/dvwebloader.html`
- **Technology**: Vanilla JavaScript with jQuery
- Lightweight and well-tested

### V2 (Experimental)

> ⚠️ **Prototype / Experimental**: V2 is currently a prototype for testing purposes. It may have bugs or missing features. Use V1 for production workloads.

- **File**: `src/dvwebloaderV2.html`
- **Technology**: React 18, TypeScript (pre-built bundle)

V2 reuses the file upload components from the new Dataverse SPA ([dataverse-frontend](https://github.com/IQSS/dataverse-frontend)) and the official JavaScript client library ([dataverse-client-javascript](https://github.com/IQSS/dataverse-client-javascript)). This ensures consistency with the main Dataverse application and reduces code duplication.

The bundle is built from `dataverse-frontend/src/standalone-uploader/` and packaged as a standalone JavaScript file that can run independently of the SPA.

#### V2 Configuration

Configuration is set via `window.dvWebloaderConfig` in the HTML file before the bundle loads:

```html
<script>
    window.dvWebloaderConfig = {
        useS3Tagging: true,      // Set to false for S3-compatible storage (e.g., MinIO)
        maxRetries: 3,           // Retry multipart uploads up to N times
        uploadTimeoutMs: 0,      // Timeout in ms (0 = unlimited)
        disableMD5Checksum: false // Set to true to skip checksum calculation
    };
</script>
<script type="module" src="lib/dvwebloader-v2.js"></script>
```

| Option | Default | Description |
|--------|---------|-------------|
| `useS3Tagging` | `true` | Set to `false` to disable S3 tagging (for S3-compatible storage) |
| `maxRetries` | `3` | Maximum retries for multipart upload parts |
| `uploadTimeoutMs` | `0` | Upload timeout in ms (`0` = unlimited) |
| `disableMD5Checksum` | `false` | Set to `true` to skip checksum calculation |

## Integration

### Current integration mechanism (v5.13+):

Configure dvwebloader as an integrated [UploadMethod](https://guides.dataverse.org/en/latest/installation/config.html#uploadmethods):

`curl -X PUT -d 'native/http,dvwebloader' http://localhost:8080/api/admin/settings/:UploadMethods`

Point Dataverse at the appropriate dvwebloader URL (the GDCC GitHub copy is used here):

`curl -X PUT -d 'https://gdcc.github.io/dvwebloader/src/dvwebloader.html' http://localhost:8080/api/admin/settings/:WebloaderUrl`

Once these settings are in place, an "Upload a Folder" button should appear on a given dataset's file upload page, provided that the dataset lives in S3 storage with direct-upload enabled.

Note that dvwebloader does not currently detect whether a user's API token is expired or even extant. If the page appears to hang while `Getting Dataset Information...` check your API token.

### External Tool Setup for Dataverse 5.12 and below:

Install as a dataset-level Explore Tool. The tool will appear in the Dataset Access menu:
![image](https://user-images.githubusercontent.com/6731983/192796802-c358b6df-c09b-4efc-9bd2-e3dda0adb0e1.png)

**Note that dataset-level tools only appear once there is at least one file in the dataset, so with this launch mechanism, you must add one file to the dataset by other means in order to launch this tool.** Also note that the tool is displayed in the menu and will launch when you are not logged in (and therefore don't have permission to upload, causing a failure) and on datasets where direct upload is not enabled, which will also fail.

As of now, the best way to debug issues/failures is to open the browser develop console and look at the messages there. If the issue isn't obvious from that, including the console log in an issue should help others in figuring out what is going wrong.

To install, copy/paste the curl command below and run it on your Dataverse machine:

```
curl -X POST -H 'Content-type: application/json' http://localhost:8080/api/admin/externalTools -d \
'{
  "displayName": "Dataverse WebLoader",
  "description": "Upload all  the files in a local directory!",
  "toolName": "dvwebloader",
  "scope": "dataset",
  "contentType":"text/plain",
  "types": [
    "explore"
  ],
  "toolUrl": "https://gdcc.github.io/dvwebloader/src/dvwebloader.html",
  "toolParameters": {
    "queryParameters": [
      {
        "siteUrl": "{siteUrl}"
      },
      {
        "datasetPid": "{datasetPid}"
      },
      {
        "key": "{apiToken}"
      }
    ]
  }
}'
```

Sponsored by UiT/DataverseNO
