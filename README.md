# dvwebloader
A web tool for uploading folders of files to a Dataverse dataset

Hosted at https://gdcc.github.io/dvwebloader

Current integration mechanism (subject to change):

Install as a dataset-level Explore Tool



{
  "displayName": "Dataverse WebLoader",
  "description": "Upload all  the files in a local directory!",
  "toolName": "dvwebloader",
  "scope": "dataset",
  "types": [
    "explore"
  ],
  "toolUrl": "https://gdcc.github.io/dvwebloader/src/dvwebloader.html",
  "contentType": "text/tab-separated-values",
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
}


curl -X POST -H 'Content-type: application/json' http://localhost:8080/api/admin/externalTools --upload-file dvwebloader.json

Sponsored by UiT/DataverseNO
