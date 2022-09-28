# dvwebloader
A web tool for uploading folders of files to a Dataverse dataset

Hosted at https://gdcc.github.io/dvwebloader

Current integration mechanism (subject to change):

Install as a dataset-level Explore Tool. **Note that dataset-level tools only appear once there is at least one file in the dataset, so with this launch mechanism, you must add one file to the dataset by other means in order to launch this tool.**

```bash
curl -X POST -H 'Content-type: application/json' http://localhost:8080/api/admin/externalTools -d \
'{
  "displayName": "Dataverse WebLoader",
  "description": "Upload all  the files in a local directory!",
  "toolName": "dvwebloader",
  "scope": "dataset",
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
