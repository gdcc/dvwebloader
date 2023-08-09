var fileList = [];
var rawFileMap = {};
var toRegisterFileList = [];
var observer2 = null;
var numDone = 0;
var delay = 100; //milliseconds
var UploadState = {
    QUEUED: 'queued',
    REQUESTING: 'requesting',
    UPLOADING: 'uploading',
    UPLOADED: 'uploaded',
    HASHED: 'hashed',
    FINISHED: 'finished',
    FAILED: 'failed'
};
//true indicates direct upload is being used, but cancel may set it back to false at which point direct upload functions should not do further work
var directUploadEnabled = false;
var directUploadReport = true;
var checksumAlgName;
//How many files have started being processed but aren't yet being uploaded
var filesInProgress = 0;
//The # of the current file being processed (total number of files for which upload has at least started)
var curFile = 0;
//The number of upload ids that have been assigned in the files table
var getUpId = (function() {
    var counter = -1;
    return function() {
        counter += 1;
        return counter;
    };
})();
//How many files are completely done
var finishFile = (function() {
    var counter = 0;
    return function() {
        counter += 1;
        return counter;
    };
})();
var siteUrl;
var datasetPid;
var apiKey;
var existingFiles;
var convertedFileNameMap;
var queryParams;
var dvLocale;

$(document).ready(function() {
    queryParams = new URLSearchParams(window.location.search.substring(1));
    siteUrl = queryParams.get("siteUrl");
    console.log(siteUrl);
    addIconAndLogo(siteUrl);
    datasetPid = queryParams.get("datasetPid");
    console.log('PID: ' + datasetPid);
    apiKey = queryParams.get("key");
    console.log(apiKey);
    dvLocale = queryParams.get("dvLocale");
    console.log('locale: ' + dvLocale);
    directUploadEnabled = true;
    initTranslation();
    addMessage('info', 'msgGettingDatasetInfo');
    fetch(siteUrl + "/api/files/fixityAlgorithm")
        .then((response) => {
            if (!response.ok) {
                console.log("Did not get fixityAlgorithm from Dataverse, using MD5");
                return null;
            } else {
                return response.json();
            }
        }).then(checksumAlgJson => {
            checksumAlgName = "MD5";
            if (checksumAlgJson != null) {
                checksumAlgName = checksumAlgJson.data.message;
            }
        })
        .then(() => {
            var head = document.getElementsByTagName('head')[0];
            var js = document.createElement("script");
            js.type = "text/javascript";

            switch (checksumAlgName) {
                case 'MD5':
                    js.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.0.0/md5.js";
                    break;
                case 'SHA-1':
                    js.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.0.0/sha1.js";
                    break;
                case 'SHA-256':
                    js.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.0.0/sha256.js";
                    break;
                case 'SHA-512':
                    js.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.0.0/x64-core.js";
                    head.appendChild(js);
                    js = document.createElement("script");
                    js.type = "text/javascript";
                    js.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.0.0/sha512.js";
                    break;
                default:
                    js.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.0.0/md5.js";
            }
            head.appendChild(js);
            retrieveDatasetInfo();
        });
    var input = document.getElementById('files');
    input.onchange = function(e) {
        var files = e.target.files; // FileList
        for (let i = 0; i < files.length; ++i) {
            let f = files[i];
            console.log('before ' + f.webkitRelativePath);
            queueFileForDirectUpload(f);
            console.debug(files[i].webkitRelativePath);
            //              output.innerText  = output.innerText + files[i].webkitRelativePath+"\n";
        }
        let numExists = $('#filelist>.ui-fileupload-files .file-exists').length;
        let totalFiles = Object.keys(rawFileMap).length;
        console.log('exists: ' + numExists);
        console.log('rawFileMap len: ' + totalFiles);
        if (totalFiles === numExists) {
            addMessage('info', 'msgFilesAlreadyExist');
        } else
        if (numExists !== 0 && totalFiles > numExists) {
            addMessage('info', 'msgUploadOnlyCheckedFiles');
        }
        $('label.button').hide();
    };
});
function addIconAndLogo(siteUrl) {
    // Add favicon from source Dataverse
    $('head')
        .append(
            $('<link/>')
                .attr('sizes', '180x180')
                .attr('rel', 'apple-touch-icon')
                .attr(
                    'href',
                    siteUrl +
                    '/javax.faces.resource/images/fav/apple-touch-icon.png.xhtml'))
        .append(
            $('<link/>')
                .attr('type', 'image/png')
                .attr('sizes', '16x16')
                .attr('rel', 'icon')
                .attr(
                    'href',
                    siteUrl +
                    '/javax.faces.resource/images/fav/favicon-16x16.png.xhtml'))
        .append(
            $('<link/>')
                .attr('type', 'image/png')
                .attr('sizes', '32x32')
                .attr('rel', 'icon')
                .attr(
                    'href',
                    siteUrl +
                    '/javax.faces.resource/images/fav/favicon-32x32.png.xhtml'))

        .append(
            $('<link/>')
                .attr('color', '#da532c')
                .attr('rel', 'mask-icon')
                .attr(
                    'href',
                    siteUrl +
                    '/javax.faces.resource/images/fav/safari-pinned-tab.svg.xhtml'))
        .append(
            $('<meta/>')
                .attr('content', '#da532c')
                .attr('name', 'msapplication-TileColor'))
        .append(
            $('<meta/>')
                .attr('content', '#ffffff')
                .attr('name', 'theme-color'));
    $('#logo').attr('src', siteUrl + '/logos/preview_logo.png');

}
function initTranslation() {
    initSpanTxt('select-dir-text', 'selectDir');
    initSpanTxt('help-tutorial-text', 'helpTutorial');
    initSpanTxt('sponsor-text', 'sponsor');
}
function initSpanTxt(htmlId, key) {
    $('#'+htmlId).text(getLocalizedString(dvLocale, key));
}
function addMessage(type, key) {
    $('#messages').html('').append($('<div/>').addClass(type).text(getLocalizedString(dvLocale, key)));
}
async function populatePageMetadata(data) {
    var mdFields = data.metadataBlocks.citation.fields;
    var title = "";
    var authors = "";
    var datasetUrl = siteUrl + '/dataset.xhtml?persistentId=' + datasetPid;
    var version = queryParams.get("datasetversion");
    if (version === ":draft") {
        version = "DRAFT";
    }

    for (var field in mdFields) {
        if (mdFields[field].typeName === "title") {
            title = mdFields[field].value;
        }
        if (mdFields[field].typeName === "author") {
            var authorFields = mdFields[field].value;
            for (var author in authorFields) {
                if (authors.length > 0) {
                    authors = authors + "; ";
                }
                authors = authors
                    + authorFields[author].authorName.value;
            }
        }
    }
    let mdDiv = $('<div/>').append($('<h2/>').text(getLocalizedString(dvLocale, 'uploadingTo')).append($('<a/>').prop("href", datasetUrl).prop('target', '_blank').text(title)));
    $('#top').prepend(mdDiv);
}

async function retrieveDatasetInfo() {
    $.ajax({
        url: siteUrl + '/api/datasets/:persistentId/versions/:latest?persistentId=' + datasetPid,
        headers: { "X-Dataverse-key": apiKey },
        type: 'GET',
        context: this,
        cache: false,
        dataType: "json",
        processData: false,
        success: function(body, statusText, jqXHR) {
            console.log(body);
            let data = body.data;
            console.log(data);
            populatePageMetadata(data);
            if (data.files !== null) {
                existingFiles = {};
                convertedFileNameMap = {};
                for (let i = 0; i < data.files.length; i++) {
                    let entry = data.files[i];
                    let df = entry.dataFile;
                    let convertedFile = false;
                    if (("originalFileFormat" in df)
                        && (!df.contentType === df.originalFileFormat)) {
                        console.log("The file named " + df.getString("filename")
                            + " on the server was created by Dataverse's ingest process from an original uploaded file");
                        convertedFile = true;
                    }
                    let filepath = df.filename;
                    if ('directoryLabel' in entry) {
                        filepath = entry.directoryLabel + '/' + filepath;
                    }
                    console.log("Storing: " + filepath);
                    existingFiles[filepath] = df.checksum;
                    if (convertedFile) {
                        convertedFileNameMap[removeExtension(filepath)] = filepath;
                    }
                }
            }
            $('#files').prop('disabled', false);
            addMessage('info', 'msgReadyToStart');
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.log('Failure: ' + jqXHR.status);
            console.log('Failure: ' + errorThrown);
        }
    });
}
//Not used in dvwebloader
function setupDirectUpload(enabled) {
    if (enabled) {
        directUploadEnabled = true;
        //An indicator as to which version is being used - should keep updated.
        console.log('Dataverse Direct Upload for v5.0');
        $('.ui-fileupload-upload').hide();
        $('.ui-fileupload-cancel').hide();
        //Catch files entered via upload dialog box. Since this 'select' widget is replaced by PF, we need to add a listener again when it is replaced
        var fileInput = document.getElementById('datasetForm:fileUpload_input');
        if (fileInput !== null) {
            fileInput.addEventListener('change', function(event) {
                fileList = [];
                for (var i = 0; i < fileInput.files.length; i++) {
                    queueFileForDirectUpload(fileInput.files[i]);
                }
            }, { once: false });
        }
        //Add support for drag and drop. Since the fileUploadForm is not replaced by PF, catching changes with a mutationobserver isn't needed
        var fileDropWidget = document.getElementById('datasetForm:fileUpload');
        fileDropWidget.addEventListener('drop', function(event) {
            fileList = [];
            for (var i = 0; i < event.dataTransfer.files.length; i++) {
                queueFileForDirectUpload(event.dataTransfer.files[i]);
            }
        }, { once: false });
        var config = { childList: true };
        var callback = function(mutations) {
            mutations.forEach(function(mutation) {
                for (i = 0; i < mutation.addedNodes.length; i++) {
                    //Add a listener on any replacement file 'select' widget
                    if (mutation.addedNodes[i].id === 'datasetForm:fileUpload_input') {
                        fileInput = mutation.addedNodes[i];
                        mutation.addedNodes[i].addEventListener('change', function(event) {
                            for (var j = 0; j < mutation.addedNodes[i].files.length; j++) {
                                queueFileForDirectUpload(mutation.addedNodes[i].files[j]);
                            }
                        }, { once: false });
                    }
                }
            });
        };
        if (observer2 !== null) {
            observer2.disconnect();
        }
        observer2 = new MutationObserver(callback);
        observer2.observe(document.getElementById('datasetForm:fileUpload'), config);
    } //else ?
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function cancelDatasetCreate() {
    //Page is going away - don't upload any more files, finish reporting current uploads, and then call cancelCreateCommand to clean up temp files
    if (directUploadEnabled) {
        fileList = [];
        directUploadEnabled = false;
        directUploadReport = false;
        while (curFile !== numDone) {
            $("#cancelCreate").prop('onclick', null).text("Cancel In Progress...").prop('disabled', true);
            $("#datasetForm\\:save").prop('disabled', true);
            await sleep(1000);
        }
        cancelCreateCommand();
    } else {
        cancelCreateCommand();
    }
}


async function cancelDatasetEdit() {
    //Don't upload any more files and don't send any more file entries to Dataverse, report any direct upload files that didn't get handled
    if (directUploadEnabled) {
        fileList = [];
        directUploadEnabled = false;
        directUploadReport = false;
        while (curFile !== numDone) {
            $("#doneFilesButtonnop").prop('onclick', null).text("Cancel In Progress...").prop('disabled', true);
            await sleep(1000);
        }
        cancelEditCommand();
    } else {
        cancelEditCommand();
    }
}


var inDataverseCall = false;
var fileUpload = class fileUploadClass {
    constructor(file) {
        this.file = file;
        this.state = UploadState.QUEUED;
        this.send = true;
    }
    async startRequestForDirectUploadUrl() {
        this.state = UploadState.REQUESTING;
        //Wait for each call to finish and update the DOM
        while (inDataverseCall === true) {
            await sleep(delay);
        }
        inDataverseCall = true;
        //storageId is not the location - has a : separator and no path elements from dataset
        //(String uploadComponentId, String fullStorageIdentifier, String fileName, String contentType, String checksumType, String checksumValue)
        this.requestDirectUploadUrls();
    }

    async requestDirectUploadUrls() {
        $.ajax({
            url: siteUrl + '/api/datasets/:persistentId/uploadurls?persistentId=' + datasetPid + '&size=' + this.file.size,
            headers: { "X-Dataverse-key": apiKey },
            type: 'GET',
            context: this,
            cache: false,
            dataType: "json",
            processData: false,
            success: function(body, statusText, jqXHR) {
                console.log(body);
                let data = body.data;
                console.log(data);
                this.storageId = data.storageIdentifier;
                delete data.storageIdentifier;
                this.urls = data;
                inDataverseCall = false;
                this.doUpload();
                console.log(JSON.stringify(data));
            },
            error: function(jqXHR, textStatus, errorThrown) {
                console.log('Failure: ' + jqXHR.status);
                console.log('Failure: ' + errorThrown);
                uploadFailure(jqXHR, this.file);
            }
        });
    }

    async doUpload() {
        this.state = UploadState.UPLOADING;
        var thisFile = curFile;
        this.id = thisFile;
        //This appears to be the earliest point when the file table has been populated, and, since we don't know how many table entries have had ids added already, we check
        var filerows = $('.ui-fileupload-files .ui-fileupload-row');
        //Add an id attribute to each entry so we can later match progress and errors with the right entry
        for (let i = 0; i < filerows.length; i++) {
            var upid = filerows[i].getAttribute('upid');
            if (typeof upid === "undefined" || upid === null || upid === '') {
                var newUpId = getUpId();
                filerows[i].setAttribute('upid', newUpId);
            }
        }
        //Get the list of files to upload
        var files = $('.ui-fileupload-files');
        //Find the corresponding row (assumes that the file order and the order of rows is the same)
        var fileNode = files.find("[upid='" + thisFile + "']");
        //Decrement number queued for processing
        console.log('Decrementing fip from :' + filesInProgress);
        filesInProgress = filesInProgress - 1;
        fileList.splice(fileList.indexOf(this), 1);
        curFile = curFile + 1;
        const progBar = fileNode.find('.ui-fileupload-progress');
        const cancelButton = fileNode.find('.ui-fileupload-cancel');
        var cancelled = false;
        cancelButton.click(function() {
            cancelled = true;
        });
        progBar.html('');
        progBar.append($('<progress/>').attr('class', 'ui-progressbar ui-widget ui-widget-content ui-corner-all'));
        if (this.urls.hasOwnProperty("url")) {
            $.ajax({
                url: this.urls.url,
                headers: { "x-amz-tagging": "dv-state=temp" },
                type: 'PUT',
                data: this.file,
                context: this,
                cache: false,
                processData: false,
                success: function() {
                    //ToDo - cancelling abandons the file. It is marked as temp so can be cleaned up later, but would be good to remove now (requires either sending a presigned delete URL or adding a callback to delete only a temp file
                    if (!cancelled) {
                        this.reportUpload();
                    }
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log('Failure: ' + jqXHR.status);
                    console.log('Failure: ' + errorThrown);
                    uploadFailure(jqXHR, thisFile);
                },
                xhr: function() {
                    var myXhr = $.ajaxSettings.xhr();
                    if (myXhr.upload) {
                        myXhr.upload.addEventListener('progress', function(e) {
                            if (e.lengthComputable) {
                                var doublelength = 2 * e.total;
                                progBar.children('progress').attr({
                                    value: e.loaded,
                                    max: doublelength
                                });
                            }
                        });
                    }
                    return myXhr;
                }
            });
        } else {
            var loaded = [];
            this.etags = [];
            this.numEtags = 0;
            var doublelength = 2 * this.file.size;
            var partSize = this.urls.partSize;
            var started = 0;
            console.log('Num parts: ' + Object.keys(this.urls.urls).length);
            loaded[thisFile] = [];
            for (const [key, value] of Object.entries(this.urls.urls)) {
                if (!directUploadEnabled || cancelled) {
                    //Direct upload has been cancelled - quit uploading new parts and abort this mp upload
                    //once the parts in progress are done
                    while ((started - this.numEtags) > 0) {
                        await sleep(delay);
                    }
                    this.cancelMPUpload();
                    directUploadFinished();
                    break;
                }
                started = started + 1;
                //Don't queue more than 10 parts at a time
                while ((started - this.numEtags) > 10) {
                    await sleep(delay);
                }
                if (typeof this.etags[key] === 'undefined' || this.etags[key] === -1) {
                    this.etags[key] = -1;
                    var size = Math.min(partSize, this.file.size - (key - 1) * partSize);
                    var offset = (key - 1) * partSize;
                    var blob = this.file.slice(offset, offset + size);
                    $.ajax({
                        url: value,
                        //                      headers: { "x-amz-tagging": "dv-state=temp" },
                        type: 'PUT',
                        data: blob,
                        context: this,
                        cache: false,
                        processData: false,
                        success: function(data, status, response) {
                            console.log('Successful upload of part ' + key + ' of ' + Object.keys(this.urls.urls).length);
                            //The header has quotes around the eTag
                            this.etags[key] = response.getResponseHeader('ETag').replace(/["]+/g, '');
                            this.numEtags = this.numEtags + 1;
                            if (this.numEtags === Object.keys(this.urls.urls).length) {
                                this.multipartComplete();
                            }
                        },
                        error: function(jqXHR, textStatus, errorThrown) {
                            console.log('Failure: ' + jqXHR.status);
                            console.log('Failure: ' + errorThrown);
                            console.log(thisFile + ' : part' + key);
                            this.numEtags = this.numEtags + 1;
                            this.etags[key] = -1;
                            if (this.numEtags === Object.keys(this.urls.urls).length) {
                                this.multipartComplete();
                            }
                        },
                        xhr: function() {
                            var myXhr = $.ajaxSettings.xhr();
                            if (myXhr.upload) {
                                myXhr.upload.addEventListener('progress', function(e) {
                                    if (e.lengthComputable) {
                                        loaded[thisFile][key - 1] = e.loaded;
                                        var total = 0;
                                        for (let val of loaded[thisFile].values()) {
                                            //if parts with lower keys haven't reported yet, there could be undefined values in the array = skip those
                                            if (typeof val !== 'undefined') {
                                                total = total + val;
                                            }
                                        }
                                        progBar.children('progress').attr({
                                            value: total,
                                            max: doublelength
                                        });
                                    }
                                });
                            }
                            return myXhr;
                        }
                    });
                }
            }
        }
    }

    //All of the multipart part uploads have succeeded or failed. Here we decide whether to finish, retry, or cancel/abort
    multipartComplete() {
        console.log('reporting file ' + this.file.name);
        var allGood = true;
        //Safety check - verify that all eTags were set
        for (let val in this.etags.values()) {
            if (val === -1) {
                allGood = false;
                break;
            }
        }
        if (!allGood) {
            if (this.alreadyRetried) {
                console.log('Error after retrying ' + this.file.name);
                uploadFailure(null, this.file.name);
                this.cancelMPUpload();
            } else {
                this.alreadyRetried = true;
                this.doUpload();
            }
        } else {
            this.finishMPUpload();
        }
    }

    reportUpload() {
        this.state = UploadState.UPLOADED;
        console.log('S3 Upload complete for ' + this.file.name + ' : ' + this.storageId);
        if (directUploadReport) {
            getChecksum(this.file, prog => {
                var current = 1 + prog;
                $('[upid="' + this.id + '"] progress').attr({
                    value: current,
                    max: 2
                });
            }).then(checksum => {
                console.log('checksum done');
                this.hashVal = checksum;
                this.handleDirectUpload();
            }).catch(err => console.error(err));
        } else {
            console.log("Abandoned: " + this.storageId);
        }
    }
    async cancelMPUpload() {
        $.ajax({
            url: siteUrl + this.urls.abort,
            headers: { "X-Dataverse-key": apiKey },
            type: 'DELETE',
            context: this,
            cache: false,
            processData: false,
            success: function() {
                console.log('Successfully cancelled upload of ' + this.file.name);
            },
            error: function(jqXHR, textStatus, errorThrown) {
                console.log('Failure: ' + jqXHR.status);
                console.log('Failure: ' + errorThrown);
            }
        });
    }
    async finishMPUpload() {
        var eTagsObject = {};
        for (var i = 1; i <= this.numEtags; i++) {
            eTagsObject[i] = this.etags[i];
        }
        $.ajax({
            url: siteUrl + this.urls.complete,
            type: 'PUT',
            headers: { "X-Dataverse-key": apiKey },
            context: this,
            data: JSON.stringify(eTagsObject),
            cache: false,
            processData: false,
            success: function() {
                console.log('Successfully completed upload of ' + this.file.name);
                this.reportUpload();
            },
            error: function(jqXHR, textStatus, errorThrown) {
                console.log('Failure: ' + jqXHR.status);
                console.log('Failure: ' + errorThrown);
            }
        });
    }

    async handleDirectUpload() {
        this.state = UploadState.HASHED;
        //Wait for each call to finish and update the DOM
        while (inDataverseCall === true) {
            await sleep(delay);
        }
        toRegisterFileList.push(this);
        directUploadFinished();
    }
}
    ;
function removeExtension(name) {
    let extIndex = name.indexOf(".");
    let sepIndex = name.indexOf('/');
    if (extIndex > sepIndex) {
        return name.substring(0, extIndex);
    } else {
        return name;
    }

}
function queueFileForDirectUpload(file) {
    if (fileList.length === 0) { //uploadWidgetDropRemoveMsg();
    }
    var fUpload = new fileUpload(file);
    let send = true;
    let path = file.webkitRelativePath.substring(file.webkitRelativePath.indexOf('/') + 1);
    console.log(path);
    if (path in existingFiles) {
        send = false;
    } else if (removeExtension(path) in convertedFileNameMap) {
        send = false;
    }
    rawFileMap[path] = file;
    let i = rawFileMap.length;
    //startUploads();
    if (send) {
        if ($('#upload').length === 0) {
            $('<button/>').prop('id', 'upload').text(getLocalizedString(dvLocale, 'startUpload')).addClass('button').click(startUploads).appendTo($('#top'));
        }
    }
    let fileBlock = $('#filelist>.ui-fileupload-files');
    if (fileBlock.length === 0) {
        fileBlock = ($('<div/>').addClass('ui-fileupload-files')).appendTo($('#filelist'));
    }
    let row = ($('<div/>').addClass('ui-fileupload-row').attr('upid', 'file_' + fileBlock.children().length)).appendTo(fileBlock);
    if (!send) {
        row.addClass('file-exists');
    }
    row.append($('<input/>').prop('type', 'checkbox').prop('id', 'file_' + fileBlock.children().length).prop('checked', send))
        .append($('<div/>').addClass('ui-fileupload-filename').text(path))
        .append($('<div/>').text(file.size)).append($('<div/>').addClass('ui - fileupload - progress'))
        .append($('<div/>').addClass('ui - fileupload - cancel'));
    console.log('adding click handler for file_' + fileBlock.children().length);
    $('#file_' + fileBlock.children().length).click(toggleUpload);
}

function toggleUpload() {
    console.log("Toggle " + this.id);
    console.log('isChecked ' + this.checked);
    console.log($('.ui-fileupload-row').children('input:checked').length);
    if ($('.ui-fileupload-row').children('input:checked').length !== 0) {
        console.log('yes');
        if ($('#upload').length === 0) {
            $('<button/>').prop('id', 'upload').text(getLocalizedString(dvLocale, 'startUpload')).addClass('button').click(startUploads).insertBefore($('#messages'));
            addMessage('info', 'msgStartUpload');
        }
    } else {
        $('#upload').remove();
        addMessage('info', 'msgNoFile');
    }
}

function startUploads() {
    $('#top button').remove();
    let checked = $('#filelist>.ui-fileupload-files input:checked');
    checked.each(function() {
        console.log('Name ' + $(this).siblings('.ui-fileupload-filename').text());
        let file = rawFileMap[$(this).siblings('.ui-fileupload-filename').text()];
        let fUpload = new fileUpload(file);
        fileList.push(fUpload);
    });
    if (filesInProgress < 4 && fileList.length !== 0) {
        for (let j = 0; j < Math.min(4, fileList.length); j++) {
            filesInProgress = filesInProgress + 1;
            fileList[j].startRequestForDirectUploadUrl();
        }
    }
}

async function uploadFileDirectly(urls, storageId, filesize) {
    await sleep(delay);
    inDataverseCall = false;
    if (directUploadEnabled) {
        var upload = null;
        //As long as we have the right file size, we're OK
        for (let i = 0; i < fileList.length; i++) {
            if (fileList[i].file.size == filesize) {
                upload = fileList.splice(i, 1)[0];
                break;
            }
        }
        upload.urls = JSON.parse(urls);
        upload.storageId = storageId;
        //Increment count of files being processed
        curFile = curFile + 1;
        console.log('Uploading ' + upload.file.name + ' as ' + storageId + ' to ' + urls);
        upload.doUpload();
    }
}




function removeErrors() {
    var errors = document.getElementsByClassName("ui-fileupload-error");
    for (let i = errors.length - 1; i >= 0; i--) {
        errors[i].parentNode.removeChild(errors[i]);
    }
}

var observer = null;
// uploadStarted and uploadFinished are not related to direct upload.
// They deal with clearing old errors and watching for new ones and then signaling when all uploads are done
function uploadStarted() {
    // If this is not the first upload, remove error messages since
    // the upload of any files that failed will be tried again.
    removeErrors();
    var curId = 0;
    //Find the upload table body
    var files = $('.ui-fileupload-files .ui-fileupload-row');
    //Add an id attribute to each entry so we can later match errors with the right entry
    for (let i = 0; i < files.length; i++) {
        files[i].setAttribute('upid', curId);
        curId = curId + 1;
    }
    //Setup an observer to watch for additional rows being added
    var config = { childList: true };
    var callback = function(mutations) {
        //Add an id attribute to all new entries
        mutations.forEach(function(mutation) {
            for (let i = 0; i < mutation.addedNodes.length; i++) {
                mutation.addedNodes[i].setAttribute('upid', curId);
                curId = curId + 1;
            }
            //Remove existing error messages since adding a new entry appears to cause a retry on previous entries
            removeErrors();
        });
    };
    //uploadStarted appears to be called only once, but, if not, we should stop any current observer
    if (observer !== null) {
        observer.disconnect();
    }
    observer = new MutationObserver(callback);
    observer.observe(files[0].parentElement, config);
}

function uploadFinished(fileupload) {
    if (fileupload.files.length === 0) {
        $('button[id$="AllUploadsFinished"]').trigger('click');
        //stop observer when we're done
        if (observer !== null) {
            observer.disconnect();
            observer = null;
        }
    }
}

async function directUploadFinished() {

    numDone = finishFile();
    var total = curFile;
    var inProgress = filesInProgress;
    var inList = fileList.length;
    console.log(inList + ' : ' + numDone + ' : ' + total + ' : ' + inProgress);
    if (directUploadEnabled) {
        if (inList === 0) {
            if (total === numDone) {
                //   $('button[id$="AllUploadsFinished"]').trigger('click');
                console.log("All files in S3");
                addMessage('info', 'msgUploadCompleteRegistering');
                let body = [];
                for (let i = 0; i < toRegisterFileList.length; i++) {
                    let fup = toRegisterFileList[i];
                    console.log(fup.file.webkitRelativePath + ' : ' + fup.storageId);
                    let entry = {};
                    entry.storageIdentifier = fup.storageId;
                    entry.fileName = fup.file.name;
                    let path = fup.file.webkitRelativePath;
                    console.log(path);
                    path = path.substring(path.indexOf('/'), path.lastIndexOf('/'));
                    if (path.length !== 0) {
                        entry.directoryLabel = path;
                    }
                    entry.checksum = {};
                    entry.checksum['@type'] = checksumAlgName;
                    entry.checksum['@value'] = fup.hashVal;
                    entry.mimeType = fup.file.type;
                    if (entry.mimeType == '') {
                        entry.mimeType = 'application/octet-stream';
                    }
                    body.push(entry);
                }
                console.log(JSON.stringify(body));
                let fd = new FormData();
                fd.append('jsonData', JSON.stringify(body));
                $.ajax({
                    url: siteUrl + '/api/datasets/:persistentId/addFiles?persistentId=' + datasetPid,
                    headers: { "X-Dataverse-key": apiKey },
                    type: 'POST',
                    enctype: 'multipart/form-data',
                    contentType: false,
                    context: this,
                    cache: false,
                    data: fd,
                    processData: false,
                    success: function(body, statusText, jqXHR) {
                        console.log("All files sent to " + siteUrl + '/dataset.xhtml?persistentId=doi:' + datasetPid + '&version=DRAFT');
                        addMessage('success', 'Upload complete, all files in dataset. Close this window and refresh your dataset page to see the uploaded files.');
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        console.log('Failure: ' + jqXHR.status);
                        console.log('Failure: ' + errorThrown);
                        //uploadFailure(jqXHR, thisFile);
                    }
                });
                //stop observer when we're done
                if (observer !== null) {
                    observer.disconnect();
                    observer = null;
                }
            }
        } else {
            if ((inProgress < 4) && (inProgress < inList)) {
                filesInProgress = filesInProgress + 1;
                for (i = 0; i < fileList.length; i++) {
                    if (fileList[i].state === UploadState.QUEUED) {
                        fileList[i].startRequestForDirectUploadUrl();
                        break;
                    }
                }
            }
        }
    }
    await sleep(delay);
    inDataverseCall = false;
}

async function uploadFailure(jqXHR, upid, filename) {
    // This handles HTTP errors (non-20x reponses) such as 0 (no connection at all), 413 (Request too large),
    // and 504 (Gateway timeout) where the upload call to the server fails (the server doesn't receive the request)
    // It notifies the user and provides info about the error (status, statusText)
    // On some browsers, the status is available in an event: window.event.srcElement.status
    // but others, (Firefox) don't support this. The calls below retrieve the status and other info
    // from the call stack instead (arguments to the fail() method that calls onerror() that calls this function

    if (directUploadEnabled) {
        await sleep(delay);
    }
    inDataverseCall = false;
    //Retrieve the error number (status) and related explanation (statusText)
    var status = 0;
    var statusText = null;
    // There are various metadata available about which file the error pertains to
    // including the name and size.
    // However, since the table rows created by PrimeFaces only show name and approximate size,
    // these may not uniquely identify the affected file. Therefore, we set a unique upid attribute
    // in uploadStarted (and the MutationObserver there) and look for that here. The files array has
    // only one element and that element includes a description of the row involved, including it's upid.

    var name = null;
    var id = null;
    if (jqXHR === null) {
        status = 1; //made up
        statusText = 'Aborting';
    } else if ((typeof jqXHR !== 'undefined')) {
        status = jqXHR.status;
        statusText = jqXHR.statusText;
        id = upid;
        name = filename;
    } else {
        try {
            name = arguments.callee.caller.caller.arguments[1].files[0].name;
            id = arguments.callee.caller.caller.arguments[1].files[0].row[0].attributes.upid.value;
            status = arguments.callee.caller.caller.arguments[1].jqXHR.status;
            statusText = arguments.callee.caller.caller.arguments[1].jqXHR.statusText;
        } catch (err) {
            console.log("Unable to determine status for error - assuming network issue");
            console.log("Exception: " + err.message);
        }
    }

    //statusText for error 0 is the unhelpful 'error'
    if (status === 0)
        statusText = 'Network Error';
    //Log the error
    console.log('Upload error:' + name + ' upid=' + id + ', Error ' + status + ': ' + statusText);
    //Find the table
    var rows = $('.ui-fileupload-files .ui-fileupload-row');
    //Create an error element
    var node = document.createElement("TD");
    //Add a class to make finding these errors easy
    node.classList.add('ui-fileupload-error');
    //Add the standard error message class for formatting purposes
    node.classList.add('ui-message-error');
    var textnode = document.createTextNode("Upload unsuccessful (" + status + ": " + statusText + ").");
    node.appendChild(textnode);
    //Add the error message to the correct row
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('upid') === id) {
            //Remove any existing error message/only show last error (have seen two error 0 from one network disconnect)
            var err = rows[i].getElementsByClassName('ui-fileupload-error');
            if (err.length !== 0) {
                err[0].remove();
            }
            rows[i].appendChild(node);
            break;
        }
    }
    if (directUploadEnabled) {
        //Mark this file as processed and keep processing further files
        directUploadFinished();
    }
}
//MD5 Hashing functions

function readChunked(file, chunkCallback, endCallback) {
    var fileSize = file.size;
    var chunkSize = 64 * 1024 * 1024; // 64MB
    var offset = 0;
    var reader = new FileReader();
    reader.onload = function() {
        if (reader.error) {
            endCallback(reader.error || {});
            return;
        }
        offset += reader.result.length;
        // callback for handling read chunk
        // TODO: handle errors
        chunkCallback(reader.result, offset, fileSize);
        if (offset >= fileSize) {
            endCallback(null);
            return;
        }
        readNext();
    };
    reader.onerror = function(err) {
        endCallback(err || {});
    };
    function readNext() {
        var fileSlice = file.slice(offset, offset + chunkSize);
        reader.readAsBinaryString(fileSlice);
    }
    readNext();
}
function getChecksum(blob, cbProgress) {
    return new Promise((resolve, reject) => {

        var checksumAlg;
        switch (checksumAlgName) {
            case 'MD5':
                checksumAlg = CryptoJS.algo.MD5.create();
                break;
            case 'SHA-1':
                checksumAlg = CryptoJS.algo.SHA1.create();
                break;
            case 'SHA-256':
                checksumAlg = CryptoJS.algo.SHA256.create();
                break;
            case 'SHA-512':
                checksumAlg = CryptoJS.algo.SHA512.create();
                break;
            default:
                console.log('$(checksumAlgName) is not supported, using MD5 as the checksumAlg checksum Algorithm');
                checksumAlg = CryptoJS.algo.MD5.create();
        }
        readChunked(blob, (chunk, offs, total) => {
            checksumAlg.update(CryptoJS.enc.Latin1.parse(chunk));
            if (cbProgress) {
                cbProgress(offs / total);
            }
        }, err => {
            if (err) {
                reject(err);
            } else {
                // TODO: Handle errors
                var hash = checksumAlg.finalize();
                var hashHex = hash.toString(CryptoJS.enc.Hex);
                resolve(hashHex);
            }
        });
    });
}
