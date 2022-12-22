# dvwebloader
A web tool for uploading folders of files to a Dataverse dataset

Hosted at https://gdcc.github.io/dvwebloader

Current integration mechanism (will change with Dataverse v5.13):

Install as a dataset-level Explore Tool. The tool will appear in the Dataset Access menu:
![image](https://user-images.githubusercontent.com/6731983/192796802-c358b6df-c09b-4efc-9bd2-e3dda0adb0e1.png)

**Note that dataset-level tools only appear once there is at least one file in the dataset, so with this launch mechanism, you must add one file to the dataset by other means in order to launch this tool.** Also note that the tool is displayed in the menu and will launch when you are not logged in (and therefore don't have permission to upload, causing a failure) and on datasets where direct upload is not enabled, which will also fail.

As of now, the best way to debug issues/failures is to open the browser develop console and look at the messages there. If the issue isn't obvious from that, including the console log in an issue should help others in figuring out what is going wrong.

To install, copy/paste the curl command below and run it on your Dataverse machine:

```bash
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
