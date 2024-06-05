function handleImageError(image, siteUrl) {
    let currentFallback = parseInt(image.getAttribute('data-fallback-index') || '0');

    if(currentFallback == 0){
        image.src = siteUrl + '/logos/preview_logo.png';
        image.dataset.fallbackIndex = 1;
    }
    else{
        image.src = 'images/logo_placeholder.png';
        image.onerror = null;
    }
}