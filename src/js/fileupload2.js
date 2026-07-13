import getLocalizedString from './lang.js';

let startUploadsHasBeenCalled = false;
var isRetrievingDatasetInfo = false;
var fileList = [];
var rawFileMap = {};
var toRegisterFileList = [];
var observer2 = null;
var numDone = 0;
var numDoneCounter = 0;
var delay = 100; //milliseconds
var draftExists = false;
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
function finishFile() {
    numDoneCounter += 1;
    return numDoneCounter;
}

/**
 * Resets the upload state variables and counters
 */
function resetUploadState() {
    toRegisterFileList = [];
    fileList = [];
    curFile = 0;
    numDoneCounter = 0;
    numDone = 0;
    filesInProgress = 0;
}
var siteUrl;
var datasetPid;
var apiKey;
var existingFiles = {};
var convertedFileNameMap = {};
var queryParams;
var dvLocale;
var uploadLimits = {
    numberOfFilesRemaining: null,
    storageQuotaRemaining: null,
    successfullyRetrieved: false
};

$(document).ready(function() {
    startUploadsHasBeenCalled  = false;
    queryParams = new URLSearchParams(window.location.search.substring(1));
    siteUrl = queryParams.get("siteUrl");
    console.log(siteUrl);
    addIconAndLogo(siteUrl);
    datasetPid = queryParams.get("datasetPid");
    console.log('PID: ' + datasetPid);
    apiKey = queryParams.get("key");
    dvLocale = queryParams.get("dvLocale");
    console.log('locale: ' + dvLocale);
    directUploadEnabled = true;
    isRetrievingDatasetInfo = true;
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
            if (checksumAlgJson != null && checksumAlgJson.data) {
                checksumAlgName = checksumAlgJson.data.message;
            }
        })
        .catch(error => {
            console.log("Error fetching fixity algorithm, using MD5: " + error);
            checksumAlgName = "MD5";
        })
        .then(() => {
            var head = document.getElementsByTagName('head')[0];
            var js = document.createElement("script");
            js.type = "text/javascript";

            switch (checksumAlgName) {
                case 'MD5':
                    js.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/md5.js";
                    break;
                case 'SHA-1':
                    js.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/sha1.js";
                    break;
                case 'SHA-256':
                    js.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/sha256.js";
                    break;
                case 'SHA-512':
                    js.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/x64-core.js";
                    //Make async false to avoid sha512 loading before the x64-core which can cause an error
                    js.async = false;
                    head.appendChild(js);
                    js = document.createElement("script");
                    js.type = "text/javascript";
                    js.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/sha512.js";
                    js.async = false;
                    break;
                default:
                    js.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/md5.js";
            }
            head.appendChild(js);
            retrieveDatasetInfo();
        });
    var input = document.getElementById('files');
    input.onchange = function(e) {
        var files = e.target.files; // FileList
        if (files.length > 0) {
            $('#pending-text').text(getLocalizedString(dvLocale, 'msgProcessingFiles'));
            $('#pending-spinner').show();

            setTimeout(function() {
                let fileBlock = $('#filelist>.ui-fileupload-files');
                if (fileBlock.length === 0) {
                    fileBlock = ($('<div/>').addClass('ui-fileupload-files')).appendTo($('#filelist'));
                }
                let currentCount = fileBlock.children().length;
                let parent = fileBlock.parent();
                fileBlock.detach();

                for (let i = 0; i < files.length; ++i) {
                    queueFileForDirectUpload(files[i], fileBlock, currentCount + i);
                }
                fileBlock.appendTo(parent);

                let totalFiles = Object.keys(rawFileMap).length;
                toggleUpload();
                $('label.button').hide();
                // Add buttons for selecting/deselecting files
                if ($('.file-selection-buttons').length === 0) {
                    $('<div/>')
                      .addClass('file-selection-buttons')
                      .append($('<button/>')
                        .addClass('button-sm')
                        .text(getLocalizedString(dvLocale, 'msgSelectAllNew'))
                        .click(selectMaxNewFiles))
                      .append($('<button/>')
                        .addClass('button-sm')
                        .text(getLocalizedString(dvLocale, 'msgDeselectAll'))
                        .click(deselectAllFiles))
                      .append($('<label/>')
                        .attr('for', 'maxFilesInput')
                        .text(' ' + getLocalizedString(dvLocale, 'msgMaxFiles')))
                      .append($('<input/>')
                        .attr('type', 'number')
                        .attr('id', 'maxFilesInput')
                        .attr('min', '1')
                        .attr('max', getEffectiveMaxFiles(totalFiles))
                        .attr('value', getEffectiveMaxFiles(totalFiles))
                        .addClass('input-sm')
                        .on('change', updateMaxFiles))
                      .insertBefore($('#filelist'));
                } else {
                    $('#maxFilesInput').attr('max', getEffectiveMaxFiles(totalFiles)).val(getEffectiveMaxFiles(totalFiles));
                    $('.file-selection-buttons').show();
                }

                selectMaxNewFiles();
                $('#pending-spinner').hide();
            }, 10);
        }
    };
});


function updateMaxFiles() {
    let maxInput = $('#maxFilesInput');
    let maxFiles = parseInt(maxInput.val(), 10);
    let totalFiles = parseInt(maxInput.attr('max'), 10);
    if (isNaN(maxFiles) || maxFiles < 1) {
        maxFiles = Math.max(1, totalFiles);
        $('#maxFilesInput').val(maxFiles);
    }
    if(maxFiles > totalFiles) {
        maxFiles = totalFiles;
        $('#maxFilesInput').val(totalFiles);
    }
    toggleUpload();
}

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
                    '/jakarta.faces.resource/images/fav/apple-touch-icon.png.xhtml'))
        .append(
            $('<link/>')
                .attr('type', 'image/png')
                .attr('sizes', '16x16')
                .attr('rel', 'icon')
                .attr(
                    'href',
                    siteUrl +
                    '/jakarta.faces.resource/images/fav/favicon-16x16.png.xhtml'))
        .append(
            $('<link/>')
                .attr('type', 'image/png')
                .attr('sizes', '32x32')
                .attr('rel', 'icon')
                .attr(
                    'href',
                    siteUrl +
                    '/jakarta.faces.resource/images/fav/favicon-32x32.png.xhtml'))

        .append(
            $('<link/>')
                .attr('color', '#da532c')
                .attr('rel', 'mask-icon')
                .attr(
                    'href',
                    siteUrl +
                    '/jakarta.faces.resource/images/fav/safari-pinned-tab.svg.xhtml'))
        .append(
            $('<meta/>')
                .attr('content', '#da532c')
                .attr('name', 'msapplication-TileColor'))
        .append(
            $('<meta/>')
                .attr('content', '#ffffff')
                .attr('name', 'theme-color'));
    $('#logo')
        .attr('src', siteUrl + '/logos/preview_logo.svg')
        .attr('onerror', "handleImageError(this,'".concat(siteUrl).concat("')"));
}
function initTranslation() {
    initSpanTxt('title-text', 'title');
    initSpanTxt('select-dir-text', 'selectDir');
    initSpanTxt('help-tutorial-text', 'helpTutorial');
    initSpanTxt('sponsor-text', 'sponsor');
}
function initSpanTxt(htmlId, key) {
    $('#'+htmlId).text(getLocalizedString(dvLocale, key));
}

function formatMessage(key, keyArgs) {
    let msg = getLocalizedString(dvLocale, key);

    if(keyArgs && Array.isArray(keyArgs)) {
        for (var i = 0; i < keyArgs.length; i++) {
            msg = msg.replaceAll('{'+i+'}', keyArgs[i]);
        }
    }
    return msg;
}

function addMessage(type, key, ...keyArgs) {
    let msg = formatMessage(key, keyArgs);
    $('#messages').html('')
        .append($('<div/>').addClass(type).html(msg));
}

function ensureUploadLimitsField() {
    if ($('#upload-limits').length === 0) {
        $('<div/>').prop('id', 'upload-limits').insertAfter($('#messages'));
    }
}

function setUploadLimitsMessage(type, key, ...keyArgs) {
    ensureUploadLimitsField();
    let msg = formatMessage(key, keyArgs);
    $('#upload-limits').html('')
        .append($('<div/>').addClass(type).html(msg));
}

function addContentWarning(key, ...keyArgs) {
    let msg = formatMessage(key, keyArgs);
    $('#content-warnings').html('')
        .append($('<div/>').addClass('warn').html(msg));
}

function formatBytes(bytes) {
    if (bytes === null || typeof bytes === 'undefined') {
        return getLocalizedString(dvLocale, 'msgUnlimited');
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value = value / 1024;
        unitIndex += 1;
    }
    const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
    return value.toFixed(precision) + ' ' + units[unitIndex];
}

function getCheckedFilesTotalSize() {
    let totalSize = 0;
    $('#filelist>.ui-fileupload-files .ui-fileupload-row').each(function() {
        let checkbox = $(this).children('input[type="checkbox"]');
        if (checkbox.prop('checked')) {
            let fileName = $(this).find('.ui-fileupload-filename').text();
            let file = rawFileMap[fileName];
            if (file) {
                totalSize += file.size;
            }
        }
    });
    return totalSize;
}

function getCheckedFilesCount() {
    return $('.ui-fileupload-row').children('input:checked').length;
}

function canSelectionFitStorageQuota(totalSize) {
    return uploadLimits.storageQuotaRemaining === null || totalSize <= uploadLimits.storageQuotaRemaining;
}

function updateUploadLimitsMessage() {
    let filesRemaining = uploadLimits.numberOfFilesRemaining;
    let storageRemaining = uploadLimits.storageQuotaRemaining;
    if (!uploadLimits.successfullyRetrieved) {
        setUploadLimitsMessage('info', 'msgUploadLimitsUnavailable');
    } else if (filesRemaining !== null || storageRemaining !== null) {
        setUploadLimitsMessage('info', 'msgUploadLimits',
            filesRemaining === null ? getLocalizedString(dvLocale, 'msgUnlimited') : filesRemaining,
            formatBytes(storageRemaining));
    }
}

async function fetchUploadLimits() {
    uploadLimits.successfullyRetrieved = false;

    try {
        const uploadLimitsResponse = await $.ajax({
            url: siteUrl + '/api/datasets/:persistentId/uploadlimits?persistentId=' + datasetPid,
            headers: { "X-Dataverse-key": apiKey },
            type: 'GET',
            cache: false,
            dataType: 'json'
        });

        uploadLimits.successfullyRetrieved = true;

        const limits = uploadLimitsResponse && uploadLimitsResponse.data
            ? uploadLimitsResponse.data.uploadLimits
            : null;

        uploadLimits.numberOfFilesRemaining = (limits && typeof limits.numberOfFilesRemaining === 'number')
            ? limits.numberOfFilesRemaining
            : null;
        uploadLimits.storageQuotaRemaining = (limits && typeof limits.storageQuotaRemaining === 'number')
            ? limits.storageQuotaRemaining
            : null;
    } catch (error) {
        console.log('Upload limits unavailable:', error);
        uploadLimits.successfullyRetrieved = false;
        uploadLimits.numberOfFilesRemaining = null;
        uploadLimits.storageQuotaRemaining = null;
    }
}

function getEffectiveMaxFiles(totalFiles) {
    if (uploadLimits.storageQuotaRemaining !== null && uploadLimits.storageQuotaRemaining <= 0) {
        return 0;
    }
    if (uploadLimits.numberOfFilesRemaining === null) {
        return totalFiles;
    }
    return Math.min(totalFiles, Math.max(uploadLimits.numberOfFilesRemaining, 0));
}

async function populatePageMetadata(data) {
    var mdFields = data.metadataBlocks.citation.fields;
    var title = "";
    var authors = "";
    var datasetUrl = siteUrl + '/dataset.xhtml?persistentId=' + datasetPid;
    draftExists = data.latestVersionPublishingState && data.latestVersionPublishingState === "DRAFT";

    for (var field in mdFields) {
        if (mdFields[field].typeName === "title") {
            title = mdFields[field].value;
        }
        if (mdFields[field].typeName === "author") {
            var authorFields = mdFields[field].value;
            for (var i = 0; i < authorFields.length; i++) {
                if (authors.length > 0) {
                    authors = authors.concat("; ");
                }
                authors = authors.concat(authorFields[i].authorName.value);
            }
        }
    }
    let container = $('<div/>');
    container.append($('<h2/>').text(getLocalizedString(dvLocale, 'uploadingTo')));

    let block = $('<div/>').addClass('metadata-block');
    block.append($('<a/>').addClass('metadata-title').prop("href", datasetUrl).prop('target', '_blank').text(title));

    if (authors.length > 0) {
        block.append($('<div/>').addClass('metadata-authors').text(authors));
    }

    block.append($('<div/>').addClass('metadata-doi').text(datasetPid));

    container.append(block);
    $('#top').prepend(container);
}

/**
 * Refreshes dataset information from Dataverse
 * @param {boolean} isInitialLoad - Whether this is the initial load or a refresh
 */
async function retrieveDatasetInfo(isInitialLoad = true) {
    isRetrievingDatasetInfo = true;
    $('#files').prop('disabled', true);
    if ($('#upload').length > 0) {
        $('#upload').addClass('disabled').prop('disabled', true);
    }
    addMessage('info', 'msgGettingDatasetInfo');
    $('#pending-text').text(getLocalizedString(dvLocale, 'msgGettingDatasetInfo'));
    $('#pending-spinner').show();
    try {
        await fetchUploadLimits();
        updateUploadLimitsMessage();
        // First, check for dataset locks
        const locksResponse = await $.ajax({
            url: siteUrl + '/api/datasets/:persistentId/locks?persistentId=' + datasetPid,
            headers: { "X-Dataverse-key": apiKey },
            type: 'GET',
            cache: false,
            dataType: "json"
        });

        let isLockedInReview = false;
        if (locksResponse.data && locksResponse.data.length > 0) {
            isLockedInReview = locksResponse.data.some(lock => lock.lockType === "InReview");
        }

        // If locked but not InReview, disable upload
        if (locksResponse.data && locksResponse.data.length > 0 && !isLockedInReview) {
            addMessage('error', 'msgDatasetLocked');
            disableUploadFunctionality();
            addRefreshButton();
            isRetrievingDatasetInfo = false;
            $('#pending-spinner').hide();
            return;
        }

        // If locked InReview, check user permissions
        if (isLockedInReview) {
            const permissionsResponse = await $.ajax({
                url: siteUrl + '/api/datasets/:persistentId/userPermissions?persistentId=' + datasetPid,
                headers: { "X-Dataverse-key": apiKey },
                type: 'GET',
                cache: false,
                dataType: "json"
            });

            if (!permissionsResponse.data || !permissionsResponse.data.canPublishDataset) {
                addMessage('error', 'msgDatasetLockedInReview');
                disableUploadFunctionality();
                addRefreshButton();
                isRetrievingDatasetInfo = false;
                $('#pending-spinner').hide();
                return;
            }
        }

        // If not locked or user has permission, proceed with retrieving dataset info
        const datasetResponse = await $.ajax({
            url: siteUrl + '/api/datasets/:persistentId/versions/:latest?persistentId=' + datasetPid,
            headers: { "X-Dataverse-key": apiKey },
            type: 'GET',
            cache: false,
            dataType: "json"
        });

        console.log(datasetResponse);
        let data = datasetResponse.data;
        console.log(data);
        if(isInitialLoad) {
            populatePageMetadata(data);
        }
        existingFiles = {};
        convertedFileNameMap = {};
        if (data.files !== null) {
            for (let i = 0; i < data.files.length; i++) {
                let entry = data.files[i];
                let df = entry.dataFile;
                let convertedFile = false;
                if (("originalFileFormat" in df)
                    && (!(df.contentType === df.originalFileFormat))) {
                    console.log("The file named " + df.filename
                        + " on the server was created by Dataverse's ingest process from an original uploaded file");
                    convertedFile = true;
                }
                let filepath = df.filename;
                if ('directoryLabel' in entry) {
                    filepath = entry.directoryLabel + '/' + filepath;
                }
                //console.log("Storing: " + filepath);
                existingFiles[filepath] = df.checksum;
                if (convertedFile) {
                    convertedFileNameMap[removeExtension(filepath)] = filepath;
                }
            }
        }
        $('#files').prop('disabled', false);
        isRetrievingDatasetInfo = false;

        // Refresh listed files in case any were selected before this call finished
        if ($('#filelist>.ui-fileupload-files .ui-fileupload-row').length > 0) {
            refreshListedFileStates();
        }

        if (isInitialLoad || $('#filelist>.ui-fileupload-files').length === 0) {
            addMessage('info', 'msgReadyToStart');
            addRefreshButton();
        } else {
            let totalFiles = Object.keys(rawFileMap).length;
            let maxInput = $('#maxFilesInput');
            let oldEffectiveMax = parseInt(maxInput.attr('max'), 10);
            let currentVal = parseInt(maxInput.val(), 10);
            let effectiveMax = getEffectiveMaxFiles(totalFiles);

            maxInput.attr('max', effectiveMax);
            // If the current value was at the previous max, or is now above the new max, update it.
            if (isNaN(oldEffectiveMax) || currentVal >= oldEffectiveMax || currentVal > effectiveMax) {
                maxInput.val(effectiveMax);
            }
            toggleUpload();
        }
        $('#pending-spinner').hide();
    } catch (error) {
        isRetrievingDatasetInfo = false;
        $('#files').prop('disabled', false);
        console.log('Error:', error);
        addMessage('error', 'msgErrorRetrievingDataset');
        addRefreshButton();
        $('#pending-spinner').hide();
    }
}

/**
 * Adds a refresh button to the UI
 */
function addRefreshButton() {
    if ($('#refreshDataset').length === 0) {
    $('#button-container .button-right').append(
            $('<button/>')
            .prop('id', 'refreshDataset')
            .text(getLocalizedString(dvLocale, 'refreshDataset'))
            .addClass('button secondary')
            .click(async function() {
                if (startUploadsHasBeenCalled) {
                    //Shouldn't happen - button should be disabled, but let's be conservative
                    alert("Can't refresh while upload is in progress");
                } else {
                    try {
                        // Call retrieveDatasetInfo with isInitialLoad=false to indicate this is a refresh
                        await retrieveDatasetInfo(false);

                        // Clear any previous upload information
                        resetUploadState();

                        // Only manipulate files if the file list exists and has items
                        if ($('#filelist>.ui-fileupload-files').length > 0 &&
                            $('#filelist>.ui-fileupload-files .ui-fileupload-row').length > 0) {
                            removeCloseButton();

                            refreshListedFileStates();
                            // Clear progress bars from previous uploads
                            $('.ui-fileupload-progress progress').remove();
                            // Reset any error messages or states
                            $('.ui-fileupload-error').remove();
                            addUploadButton();
                        }
                    } catch (error) {
                        console.error('Error refreshing dataset:', error);
                        addMessage('error', 'msgErrorRefreshingDataset');
                    }
                }
            }));
    } else {
        $('#refreshDataset').removeClass('disabled').prop('disabled', false);
    }
}

/**
 * Removes the refresh button from the UI
 */
function removeRefreshButton() {
    $('#refreshDataset').remove();
}
function sanitizeUploadPath(file, origPath) {
  let path = origPath.substring(0, origPath.length - file.name.length);
  path = path.replace(/[^\w\-\.\\\/ ]+/g, '_');
  return path.concat(file.name.replace(/[:<>;#/"*|?\\]/g, '_'));
}

/**
 * Adds a close button to the UI
 */
function addCloseButton() {
    if ($('#closeWebloader').length === 0) {
    // Add close button
        $('#button-container .button-left').append($('<button/>')
            .prop('id', 'closeWebloader')
            .text(getLocalizedString(dvLocale, 'closeWindow'))
            .addClass('button secondary')
            .click(function() {
                window.close();
            }));
    }
}

/**
 * Removes the close button from the UI
 */
function removeCloseButton() {
    $('#closeWebloader').remove();
}

/**
 * Adds an upload button to the UI
 */

function addUploadButton() {
    if ($('#upload').length === 0) {
        $('#button-container .button-left').append($('<button/>')
            .prop('id', 'upload')
            .text(getLocalizedString(dvLocale, 'startUpload'))
            .addClass('button')
            .click(startUploads));
    } else {
        $('#upload').removeClass('disabled').prop('disabled', false);
        if (isRetrievingDatasetInfo) {
            $('#upload').addClass('disabled').prop('disabled', true);
        }
    }
}

/**
 * Removes the upload button from the UI
 */
function removeUploadButton() {
    $('#upload').remove();
}
function disableUploadFunctionality() {
    $('#files').prop('disabled', true);
    $('.file-selection-buttons').hide();
    $('label.button').hide();
    // Disable any other relevant UI elements
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
                let fileBlock = $('#filelist>.ui-fileupload-files');
                if (fileBlock.length === 0) {
                    fileBlock = ($('<div/>').addClass('ui-fileupload-files')).appendTo($('#filelist'));
                }
                let currentCount = fileBlock.children().length;
                for (var i = 0; i < fileInput.files.length; i++) {
                    queueFileForDirectUpload(fileInput.files[i], fileBlock, currentCount + i);
                }
            }, { once: false });
        }
        //Add support for drag and drop. Since the fileUploadForm is not replaced by PF, catching changes with a mutationobserver isn't needed
        var fileDropWidget = document.getElementById('datasetForm:fileUpload');
        fileDropWidget.addEventListener('drop', function(event) {
            fileList = [];
            let fileBlock = $('#filelist>.ui-fileupload-files');
            if (fileBlock.length === 0) {
                fileBlock = ($('<div/>').addClass('ui-fileupload-files')).appendTo($('#filelist'));
            }
            let currentCount = fileBlock.children().length;
            for (var i = 0; i < event.dataTransfer.files.length; i++) {
                queueFileForDirectUpload(event.dataTransfer.files[i], fileBlock, currentCount + i);
            }
        }, { once: false });
        var config = { childList: true };
        var callback = function(mutations) {
            mutations.forEach(function(mutation) {
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    //Add a listener on any replacement file 'select' widget
                    if (mutation.addedNodes[i].id === 'datasetForm:fileUpload_input') {
                        fileInput = mutation.addedNodes[i];
                        mutation.addedNodes[i].addEventListener('change', function(event) {
                            let fileBlock = $('#filelist>.ui-fileupload-files');
                            if (fileBlock.length === 0) {
                                fileBlock = ($('<div/>').addClass('ui-fileupload-files')).appendTo($('#filelist'));
                            }
                            let currentCount = fileBlock.children().length;
                            for (var j = 0; j < mutation.addedNodes[i].files.length; j++) {
                                queueFileForDirectUpload(mutation.addedNodes[i].files[j], fileBlock, currentCount + j);
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

const uploadUrlRateWindowMs = 60 * 1000;
const uploadUrlMaxRetries = 5;
const uploadUrlBaseRetryDelayMs = 2000;
const uploadUrlMaxRetryDelayMs = 60 * 1000;
var uploadUrlRequestTimestamps = [];
var uploadUrlCooldownUntil = 0;
var uploadUrlInterRequestDelayMs = 0;
var lastUploadUrlRequestTimestamp = 0;

function pruneUploadUrlRequestTimestamps(now = Date.now()) {
  uploadUrlRequestTimestamps = uploadUrlRequestTimestamps.filter(
    timestamp => now - timestamp < uploadUrlRateWindowMs
  );
}

function getUploadUrlAverageRatePerMinute() {
  pruneUploadUrlRequestTimestamps();
  console.log('Upload URL request average rate over last minute: ' + uploadUrlRequestTimestamps.length + '/minute');
  return uploadUrlRequestTimestamps.length;
}

function recordUploadUrlRequest() {
  let now = Date.now();
  uploadUrlRequestTimestamps.push(now);
  lastUploadUrlRequestTimestamp = now;
}

function getRetryAfterDelayMs(jqXHR) {
  let retryAfter = jqXHR && jqXHR.getResponseHeader ? jqXHR.getResponseHeader('Retry-After') : null;

  if (!retryAfter) {
    return null;
  }

  let retryAfterSeconds = parseInt(retryAfter, 10);
  if (!Number.isNaN(retryAfterSeconds)) {
    return retryAfterSeconds * 1000;
  }

  let retryAfterDate = Date.parse(retryAfter);
  if (!Number.isNaN(retryAfterDate)) {
    return Math.max(0, retryAfterDate - Date.now());
  }

  return null;
}

async function waitForUploadUrlCooldown() {
  let now = Date.now();
  let waitMs = Math.max(
    uploadUrlCooldownUntil - now,
    (lastUploadUrlRequestTimestamp + uploadUrlInterRequestDelayMs) - now
  );
  if (waitMs > 0) {
    console.log('Waiting ' + waitMs + 'ms before requesting another upload URL (cooldown or rate limiting)');
    await sleep(waitMs);
  }
}

function updateUploadUrlCooldown(delayMs) {
  uploadUrlCooldownUntil = Math.max(uploadUrlCooldownUntil, Date.now() + delayMs);
}

var fileUpload = class fileUploadClass {
    constructor(file) {
        this.file = file;
        this.state = UploadState.QUEUED;
        this.send = true;
        this.id = null;
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

    async requestDirectUploadUrls(retryCount = 0) {
        await waitForUploadUrlCooldown();
        recordUploadUrlRequest();

        $.ajax({
            url: siteUrl + '/api/datasets/:persistentId/uploadurls?persistentId=' + datasetPid + '&size=' + this.file.size,
            headers: { "X-Dataverse-key": apiKey },
            type: 'GET',
            context: this,
            cache: false,
            dataType: "json",
            processData: false,
            success: function(body, statusText, jqXHR) {
                //console.log(body);
                let data = body.data;
                //console.log(data);
                this.storageId = data.storageIdentifier;
                delete data.storageIdentifier;
                this.urls = data;
                inDataverseCall = false;
                this.doUpload();
                console.log(JSON.stringify(data));
            },
                            error: async function(jqXHR, textStatus, errorThrown) {
                console.log('Failure: ' + jqXHR.status);
                console.log('Failure: ' + errorThrown);

                if (jqXHR.status === 429 && retryCount < uploadUrlMaxRetries && directUploadEnabled) {
                    let retryAfterDelayMs = getRetryAfterDelayMs(jqXHR);

                    // Recovery wait time for this specific 429 to clear
                    let recoveryDelayMs = Math.max(
                        retryAfterDelayMs || 0,
                        Math.min(uploadUrlBaseRetryDelayMs * Math.pow(2, retryCount), uploadUrlMaxRetryDelayMs)
                    );

                    // Increase the persistent inter-request delay to slow down future calls
                    // Adding 50ms to the delay each time a 429 is encountered
                    uploadUrlInterRequestDelayMs +=50;

                    updateUploadUrlCooldown(recoveryDelayMs);

                    console.log(
                        'Received 429 while requesting upload URL for ' + this.file.name +
                        '. Recovery wait: ' + recoveryDelayMs + 'ms. Persistent delay increased to: ' +
                        uploadUrlInterRequestDelayMs + 'ms. Attempt ' +
                        (retryCount + 1) + ' of ' + uploadUrlMaxRetries
                    );

                    await sleep(recoveryDelayMs);
                    this.requestDirectUploadUrls(retryCount + 1);
                    return;
                }

                inDataverseCall = false;
                // If it hasn't been moved to processing yet, do it now so the count is right
                if (fileList.indexOf(this) !== -1) {
                    fileList.splice(fileList.indexOf(this), 1);
                    curFile = curFile + 1;
                    filesInProgress = filesInProgress - 1;
                }
                uploadFailure(jqXHR, this.id);
            }
        });
    }


    async doUpload() {
        this.state = UploadState.UPLOADING;

        //This appears to be the earliest point when the file table has been populated, and, since we don't know how many table entries have had ids added already, we check
        var filerows = $('.ui-fileupload-files .ui-fileupload-row');
        //Add an id attribute to each entry so we can later match progress and errors with the right entry
        for (let i = 0; i < filerows.length; i++) {
            var upid = filerows[i].getAttribute('upid');
            if (typeof upid === "undefined" || upid === null || upid === '') {
                var newUpId = getUpId();
                filerows[i].setAttribute('upid', 'file_' + newUpId);
                console.log("Deprecated - should not be called - just added upid: " + newUpId);
            }
        }
        //Get the list of files to upload
        var files = $('.ui-fileupload-files');
        //Find the corresponding row (assumes that the file order and the order of rows is the same)
        var fileNode = files.find("[upid='file_" + this.id + "']");
        //Decrement number queued for processing
        console.log('Decrementing fip from :' + filesInProgress);
        filesInProgress = filesInProgress - 1;
        if (fileList.indexOf(this) !== -1) {
            fileList.splice(fileList.indexOf(this), 1);
        }
        this.thisFileIndex = curFile;
        curFile = curFile + 1;

        this.performActualUpload(fileNode);
    }

    async performActualUpload(fileNode) {
        var thisFile = this.thisFileIndex;
        const progBar = fileNode.find('.ui-fileupload-progress');
        const cancelButton = fileNode.find('.ui-fileupload-cancel');
        var cancelled = false;
        cancelButton.click(function() {
            cancelled = true;
        });
        progBar.html('');
        progBar.append($('<progress/>').attr('class', 'ui-progressbar ui-widget ui-widget-content ui-corner-all'));
        if (this.urls.hasOwnProperty("url")) {
            const uploadHeaders = this.urls.url.toLowerCase().includes("x-amz-tagging")
                ? { "x-amz-tagging": "dv-state=temp" }
                : {};
            $.ajax({
                url: this.urls.url,
                headers: uploadHeaders,
                type: 'PUT',
                data: this.file,
                context: this,
                cache: false,
                processData: false,
                success: function() {
                    //ToDo - cancelling abandons the file. It is marked as temp so can be cleaned up later, but would be good to remove now (requires either sending a presigned delete URL or adding a callback to delete only a temp file
                    if (!cancelled) {
                        this.reportUpload();
                    } else {
                        directUploadFinished();
                    }
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log('Failure: ' + jqXHR.status);
                    console.log('Failure: ' + errorThrown);
                    uploadFailure(jqXHR, this.id);
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
                    const uploadHeaders = value.toLowerCase().includes("x-amz-tagging")
                        ? { "x-amz-tagging": "dv-state=temp" }
                        : {};
                    $.ajax({
                        url: value,
                        headers: uploadHeaders,
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
                uploadFailure(null, this.id);
                this.cancelMPUpload();
            } else {
                this.alreadyRetried = true;
                // Don't re-call doUpload() as it manages queue/counts which are already done for this file
                this.retryMultipartUpload();
            }
        } else {
            this.finishMPUpload();
        }
    }

    retryMultipartUpload() {
        var files = $('.ui-fileupload-files');
        var fileNode = files.find("[upid='file_" + this.id + "']");
        this.performActualUpload(fileNode);
    }

    reportUpload() {
        this.state = UploadState.UPLOADED;
        console.log('S3 Upload complete for ' + this.file.name + ' : ' + this.storageId);
        if (directUploadReport) {
            getChecksum(this.file, prog => {
                var current = 1 + prog;
                $('[upid="file_' + this.id + '"] progress').attr({
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
function removeExtension(name) {
    let extIndex = name.lastIndexOf(".");
    let sepIndex = name.indexOf('/');
    if (extIndex > sepIndex) {
        return name.substring(0, extIndex);
    } else {
        return name;
    }

}
function queueFileForDirectUpload(file, fileBlock = null, overrideId = null) {
    if (fileList.length === 0) { //uploadWidgetDropRemoveMsg();
    }
    var fUpload = new fileUpload(file);
    let send = true;

    //Relative path starts with the directory name - remove it
    let origPath = file.webkitRelativePath.substring(file.webkitRelativePath.indexOf('/') + 1);
    let path = sanitizeUploadPath(file, origPath);

    let badPath = (origPath.substring(0, origPath.length - file.name.length).match(/^[\w\-\.\\\/ ]*$/) === null);
    let badChars = !(file.name.match(/[:<>;#\/"*|?\\]/) === null);

    if (badPath || badChars) {
        if ($('#content-warnings.warn').length == 0) {
            addContentWarning('msgRequiredPathOrFileNameChange');
        }
    }

    //Now check versus existing files
    if ((path in existingFiles) || (removeExtension(path) in convertedFileNameMap)) {
        send = false;
    }
    rawFileMap[origPath] = file;
    let i = Object.keys(rawFileMap).length;
    //startUploads();
    if (send) {
        addUploadButton();
    }
    if (fileBlock === null) {
        fileBlock = $('#filelist>.ui-fileupload-files');
        if (fileBlock.length === 0) {
            fileBlock = ($('<div/>').addClass('ui-fileupload-files')).appendTo($('#filelist'));
        }
    }
    fUpload.id = overrideId !== null ? overrideId : fileBlock.children().length;
    let row = ($('<div/>').addClass('ui-fileupload-row').attr('upid', 'file_' + fUpload.id).attr('data-path', path)).appendTo(fileBlock);
    if (!send) {
        row.addClass('file-exists');
    }
    let checkbox = $('<input/>')
        .prop('type', 'checkbox')
        .prop('id', 'file_' + fUpload.id)
        .prop('checked', send)
        .on('change', toggleUpload);

    row.append(checkbox);

    let fnameElement = $('<div/>').addClass('ui-fileupload-filename').text(origPath);
    if (badPath || badChars) {
        fnameElement.addClass('badchars');
    }
    row.append(fnameElement)
        .append($('<div/>').text(file.size)).append($('<div/>').addClass('ui-fileupload-progress'))
        .append($('<div/>')
            .addClass('ui-fileupload-cancel')
            .click(function() {
                $(this).closest('.ui-fileupload-row').remove();
                delete rawFileMap[origPath];
                toggleUpload();
            }));
}

// Function to select all files not in dataset
function selectMaxNewFiles() {
    let maxFiles = parseInt($('#maxFilesInput').val(), 10);
    if (isNaN(maxFiles) || maxFiles < 0) {
        maxFiles = 0;
    }
    let checkedFiles = 0;
    let currentTotalSize = 0;
    $('#filelist>.ui-fileupload-files .ui-fileupload-row').each(function() {
        let row = $(this);
        let fileName = row.find('.ui-fileupload-filename').text();
        let file = rawFileMap[fileName];
        let fileSize = file ? file.size : 0;

        if (checkedFiles < maxFiles && !row.hasClass('file-exists') && canSelectionFitStorageQuota(currentTotalSize + fileSize)) {
            row.find('input[type="checkbox"]').prop('checked', true);
            checkedFiles++;
            currentTotalSize += fileSize;
        } else {
            row.find('input[type="checkbox"]').prop('checked', false);
        }
    });
    toggleUpload();
}

// Function to deselect all files
function deselectAllFiles() {
    $('#filelist>.ui-fileupload-files .ui-fileupload-row input[type="checkbox"]').prop('checked', false);
    toggleUpload();
}

function refreshListedFileStates() {
    $('#filelist>.ui-fileupload-files .ui-fileupload-row').each(function() {
        let row = $(this);
        let path = row.attr('data-path');
        let existsInDataset = (path in existingFiles) || (removeExtension(path) in convertedFileNameMap);
        row.toggleClass('file-exists', existsInDataset);
        if (existsInDataset) {
            row.find('input[type="checkbox"]').prop('checked', false);
        }
    });
    selectMaxNewFiles();
    toggleUpload();
}

function toggleUpload() {
    let totalRows = $('.ui-fileupload-row').length;
    let maxFiles = parseInt($('#maxFilesInput').val(), 10);
    if (isNaN(maxFiles)) {
        maxFiles = totalRows;
    }
    let checkedFiles = getCheckedFilesCount();
    let checkedFilesTotalSize = getCheckedFilesTotalSize();

    let warningMessage = null;

    // If the checkbox is being checked and we're already at the max or over quota, prevent it
    if (this && this.checked) {
        if (checkedFiles > maxFiles) {
            this.checked = false;
            checkedFiles--;
            checkedFilesTotalSize = getCheckedFilesTotalSize();
            warningMessage = { type: 'warn', key: 'msgMaxFilesReached' };
        } else if (!canSelectionFitStorageQuota(checkedFilesTotalSize)) {
            this.checked = false;
            checkedFiles--;
            checkedFilesTotalSize = getCheckedFilesTotalSize();
            warningMessage = { type: 'warn', key: 'msgStorageQuotaReached' };
        }
    }

    console.log('Checked files: ' + checkedFiles);

    if (totalRows > 0) {
        addUploadButton();
    }

    let selectionIsValid = checkedFiles !== 0 && checkedFiles <= maxFiles && canSelectionFitStorageQuota(checkedFilesTotalSize);
    $('#upload').toggleClass('disabled', !selectionIsValid).prop('disabled', !selectionIsValid);

    // Messages Priority: Warnings > Selection-specific info > Default info
    if (warningMessage) {
        addMessage(warningMessage.type, warningMessage.key);
    } else if (checkedFiles > maxFiles) {
        addMessage('warn', 'msgMaxFilesExceeded');
    } else if (!canSelectionFitStorageQuota(checkedFilesTotalSize)) {
        addMessage('warn', 'msgStorageQuotaExceeded', formatBytes(uploadLimits.storageQuotaRemaining));
    } else if (checkedFiles === 0) {
        if (totalRows > 0) {
            let numExists = $('#filelist>.ui-fileupload-files .file-exists').length;
            if (totalRows === numExists) {
                addMessage('info', 'msgFilesAlreadyExist');
            } else {
                addMessage('info', 'msgNoFile');
            }
        }
    } else {
        // checkedFiles > 0 and valid
        let numExists = $('#filelist>.ui-fileupload-files .file-exists').length;
        if (numExists !== 0) {
            addMessage('info', 'msgUploadOnlyCheckedFiles');
        } else {
            addMessage('info', 'msgStartUpload');
        }
    }
}

function startUploads() {
    let checked = $('#filelist>.ui-fileupload-files input:checked');
    if (checked.length === 0) {
        addMessage('info', 'msgNoFile');
        return;
    }
    startUploadsHasBeenCalled = true;
    resetUploadState();
    $('#refreshDataset').addClass('disabled').prop('disabled', true);
    $('#upload').remove();
    // Also disable directory selection while uploading
    $('#files').prop('disabled', true);
    $('label[for="files"]').addClass('disabled');
    // Add a message indicating uploads are in progress
    addMessage('info', 'msgUploadsInProgress');
    let checked = $('#filelist>.ui-fileupload-files input:checked');
    if (checked.length === 0) {
        addMessage('info', 'msgNoFile');
        return;
    }
    checked.each(function() {
        console.log('Name ' + $(this).siblings('.ui-fileupload-filename').text());
        let file = rawFileMap[$(this).siblings('.ui-fileupload-filename').text()];
        let fUpload = new fileUpload(file);
        fUpload.id=$(this).parent().attr("upid").replace('file_', '');
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
                if (toRegisterFileList.length === 0) {
                    console.log("No files were successfully uploaded to S3.");
                    startUploadsHasBeenCalled = false;
                    addRefreshButton();
                    addMessage('info', 'msgNoFile');
                    return;
                }
                addMessage('info', 'msgUploadCompleteRegistering');
                let body = [];
                for (let i = 0; i < toRegisterFileList.length; i++) {
                    let fup = toRegisterFileList[i];
                    console.log(fup.file.webkitRelativePath + ' : ' + fup.storageId);
                    let entry = {};
                    entry.storageIdentifier = fup.storageId;
                    //Remove bad file name chars
                    entry.fileName = fup.file.name.replace(/[:<>;#/"*|?\\]/g,'_');
                    let path = fup.file.webkitRelativePath;
                    //console.log(path);
                    path = path.substring(path.indexOf('/'), path.lastIndexOf('/'));
                    //Remove bad path chars
                    path = path.replace(/[^\w\-\.\\\/ ]+/g,'_');
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

                // Add a loading indicator before making the AJAX call
                $('#messages').append($('<div/>').attr('id', 'loading-indicator').addClass('pending')
                    .html('<div class="spinner"></div>' + formatMessage('msgRegisteringFiles')));
                // Remove the refresh button when uploads start
                removeRefreshButton();

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
                        // Remove the loading indicator
                        $('#loading-indicator').remove();

                        var datasetUrl = siteUrl + '/dataset.xhtml?persistentId=' + datasetPid + '&version=DRAFT';
                        console.log("All files sent to " + datasetUrl);
                        if(draftExists) {
                          addMessage('success', 'msgUploadComplete');
                        } else {
                          addMessage('success', 'msgUploadCompleteNewDraft', datasetUrl);
                        }
                        resetUploadState();
                        startUploadsHasBeenCalled = false;
                        addCloseButton();
                        addRefreshButton();
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        // Remove the loading indicator
                        $('#loading-indicator').remove();

                        console.log('Failure: ' + jqXHR.status);
                        console.log('Failure: ' + errorThrown);
                        if (jqXHR.status === 504 || textStatus === 'timeout') {
                            addMessage("error", "msgUploadToDataverseTimeout");
                        } else {
                            addMessage("error", "msgUploadToDataverseFailed", "Status: " + jqXHR.status + ", Error: " + errorThrown);
                        }
                        resetUploadState();
                        startUploadsHasBeenCalled = false;
                        addCloseButton();
                        addRefreshButton();
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
                for (let i = 0; i < fileList.length; i++) {
                    if (fileList[i].state === UploadState.QUEUED) {
                        fileList[i].startRequestForDirectUploadUrl();
                        break;
                    }
                }
            }
        }
    } else {
        // Direct upload was disabled (e.g., cancelled)
        if (total === numDone) {
            startUploadsHasBeenCalled = false;
            addRefreshButton();
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
    var id = upid;
    if (jqXHR === null) {
        status = 1; //made up
        statusText = 'Aborting';
        name = filename;
    } else if ((typeof jqXHR !== 'undefined')) {
        status = jqXHR.status;
        statusText = jqXHR.statusText;
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
        let rowUpid = rows[i].getAttribute('upid');
        if (rowUpid === id || rowUpid === 'file_' + id) {
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
                console.log('$(checksumAlgName) is not supported, using MD5 as the checksum Algorithm');
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