$(document).ready(function () {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // --- GLOBAL STATE ---
    const IMGBB_API_KEY = '240e18a9ba44ea52c1ca5f09a336da9a'; // Replace with actual API Key
    let db = JSON.parse(localStorage.getItem('codingvila_img_db')) || [];
    let state = {
        view: 'dashboard',
        libPage: 1,
        libSize: 30,
        galPage: 1,
        galSize: 18,
        dlCount: parseInt(localStorage.getItem('codingvila_dl_count')) || 0,
        isUploading: false,
        ssTimer: null,
        currentGalBatch: []
    };

    let charts = { trend: null, pie: null };

    const navigate = (tab) => {
        if (sessionStorage.getItem('isLoggedIn') !== 'true') {
            init();
            return;
        }
        state.view = tab;
        $('.tab-pane').addClass('d-none');
        $(`#tab-${tab}`).removeClass('d-none');
        $('#app-tabs a').removeClass('active');
        $(`[data-tab="${tab}"]`).addClass('active');

        if (tab === 'dashboard') renderDashboard();
        if (tab === 'library') { state.libPage = 1; $('#lib-table-body').empty(); renderLibrary(); }
        if (tab === 'gallery') { state.galPage = 1; $('#gallery-container').empty(); renderGallery(); }
    };

    // Login Handler
    $('#btn-login').click(function () {
        const u = $('#login-user').val();
        const p = $('#login-pass').val();
        if (u === 'admin' && p === 'admin123') {
            sessionStorage.setItem('isLoggedIn', 'true');
            $('#login-overlay').fadeOut();
            $('#app-wrapper').fadeIn();
            showToast("Authenticated successfully", "success");
            navigate('dashboard');
        } else {
            alertBox(
                "Login Failed",
                "Invalid credentials. Contact developer if forgotten."
            );

        }
    });



    $('#app-tabs a').click(function (e) { e.preventDefault(); navigate($(this).data('tab')); });
    $('#sidebar-toggle').click(() => $('#sidebar').toggleClass('active'));

    // --- UPLOAD ENGINE ---
    const dropZone = $('#drop-zone');
    dropZone.on('dragover', (e) => { e.preventDefault(); dropZone.addClass('dragover'); });
    dropZone.on('dragleave', () => dropZone.removeClass('dragover'));
    dropZone.on('drop', (e) => {
        e.preventDefault(); dropZone.removeClass('dragover');
        handleUpload(e.originalEvent.dataTransfer.files);
    });

    $('#input-files').change(function () { handleUpload(this.files); });

    async function handleUpload(files) {
        if (state.isUploading || files.length === 0) return;
        const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imgs.length === 0) return showToast("No valid images selected", "error");

        state.isUploading = true;
        $('#upload-status').removeClass('d-none');
        $('#preview-container').empty();
        $('button').attr('disabled', true);

        let count = 0;
        for (let file of imgs) {
            // Instant Preview
            const reader = new FileReader();
            reader.onload = (e) => $('#preview-container').append(`<div class="col-md-1"><img src="${e.target.result}" class="up-thumb shadow-sm border"></div>`);
            reader.readAsDataURL(file);

            const fd = new FormData();
            fd.append('image', file);

            try {
                const res = await $.ajax({
                    url: `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
                    method: 'POST', data: fd, processData: false, contentType: false
                });

                const now = new Date();
                db.push({
                    id: Date.now() + Math.random(),
                    name: file.name,
                    url: res.data.url,
                    thumb: res.data.thumb.url,
                    size: file.size,
                    ext: file.name.split('.').pop().toLowerCase(),
                    ts: now.getTime(),
                    date: now.toISOString().split('T')[0],
                    month: now.toISOString().substring(0, 7),
                    year: now.getFullYear().toString()
                });
                count++;
                let pc = Math.round((count / imgs.length) * 100);
                $('#upload-progress-bar').css('width', pc + '%');
                $('#upload-progress-text').text(`Uploading ${count}/${imgs.length} assets...`);
            } catch (err) { showToast(`Failed: ${file.name}`, "error"); }
        }

        localStorage.setItem('codingvila_img_db', JSON.stringify(db));
        state.isUploading = false;
        $('button').attr('disabled', false);
        $('#upload-status').addClass('d-none');
        showToast("Batch Upload Complete", "success");
        navigate('dashboard');
    }

    // --- LIBRARY ENGINE (GROUPING & SORTING) ---
    const renderLibrary = () => {
        const query = $('#lib-search').val().toLowerCase();
        const grouping = $('#lib-grouping').val();
        const sort = $('#lib-sort').val();

        let filtered = db.filter(i => i.name.toLowerCase().includes(query));

        // Sorting Logic
        if (sort === 'desc') filtered.sort((a, b) => b.ts - a.ts);
        else if (sort === 'asc') filtered.sort((a, b) => a.ts - b.ts);
        else if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));

        const start = (state.libPage - 1) * state.libSize;
        const slice = filtered.slice(start, start + state.libSize);

        const tbody = $('#lib-table-body');
        if (state.libPage === 1) tbody.empty();

        if (slice.length === 0 && state.libPage === 1) {
            tbody.html('<tr><td colspan="6" class="text-center p-5 text-muted small">No items found.</td></tr>');
            return;
        }

        // Grouping Logic
        const groups = {};
        if (grouping) {
            slice.forEach(item => {
                const key = item[grouping] || 'Uncategorized';
                if (!groups[key]) groups[key] = [];
                groups[key].push(item);
            });
        } else {
            groups['Recently Managed'] = slice;
        }

        Object.keys(groups).forEach(gName => {
            tbody.append(`<tr class="group-header"><td colspan="6"><i class="fas fa-folder-open me-2 text-primary"></i>${gName}</td></tr>`);
            groups[gName].forEach(img => {
                tbody.append(`
                    <tr>
                        <td><input type="checkbox" class="lib-row-check form-check-input" data-id="${img.id}"></td>
                        <td><img src="${img.thumb}" class="rounded shadow-1" style="width:50px; height:40px; object-fit:cover; cursor:pointer" onclick="openView('${img.id}')"></td>
                        <td><div class="fw-bold small text-truncate" style="max-width:250px">${img.name}</div></td>
                        <td class="small text-muted">${img.date}</td>
                        <td>
                            <div class="input-group input-group-sm" style="max-width: 250px">
                                <input type="text" class="form-control bg-light border-0 x-small" value="${img.url}" readonly>
                                <button class="btn btn-primary" onclick="copyLink('${img.url}')"><i class="fas fa-copy"></i></button>
                            </div>
                        </td>
                        <td class="text-center">
                            <div class="btn-group shadow-0">
                                <button class="btn btn-sm btn-light" onclick="forceDownload('${img.url}', '${img.name}')"><i class="fas fa-download text-primary"></i></button>
                                <button class="btn btn-sm btn-light" onclick="deleteItem('${img.id}')"><i class="fas fa-trash text-danger"></i></button>
                            </div>
                        </td>
                    </tr>
                `);
            });
        });

        $('#lib-info').text(`Showing ${Math.min(filtered.length, state.libPage * state.libSize)} of ${filtered.length} entries`);
    };

    // Infinite Scroll
    $('#lib-scroll-container').on('scroll', function () {
        if ($(this).scrollTop() + $(this).innerHeight() >= $(this)[0].scrollHeight - 100) {
            const query = $('#lib-search').val().toLowerCase();
            const total = db.filter(i => i.name.toLowerCase().includes(query)).length;
            if (state.libPage * state.libSize < total) {
                state.libPage++;
                renderLibrary();
            }
        }
    });

    $('#lib-search, #lib-grouping, #lib-sort').on('input change', () => { state.libPage = 1; $('#lib-table-body').empty(); renderLibrary(); });

    // --- GALLERY ENGINE ---
    const renderGallery = () => {
        const query = $('#gal-search').val().toLowerCase();
        let filtered = db.filter(i => i.name.toLowerCase().includes(query)).sort((a, b) => b.ts - a.ts);
        state.currentGalBatch = filtered;

        const start = (state.galPage - 1) * state.galSize;
        const slice = filtered.slice(start, start + state.galSize);
        const container = $('#gallery-container');

        if (state.galPage === 1) container.empty();

        slice.forEach(img => {
            container.append(`
                <div class="col-xl-2 col-lg-3 col-md-4 col-sm-6">
                    <div class="card gallery-card shadow-1 h-100 position-relative">
                        <input type="checkbox" class="gal-row-check form-check-input gal-check shadow-1" data-id="${img.id}">
                        <img src="${img.thumb}" class="card-img-top" style="height:160px; object-fit:cover">
                        <div class="gallery-overlay">
                            <button class="btn btn-sm btn-floating btn-light shadow-3" onclick="openView('${img.id}')"><i class="fas fa-expand text-dark"></i></button>
                            <button class="btn btn-sm btn-floating btn-light shadow-3" onclick="forceDownload('${img.url}', '${img.name}')"><i class="fas fa-download text-primary"></i></button>
                        </div>
                        <div class="card-body p-2 text-center bg-white">
                            <div class="text-truncate x-small fw-bold text-dark">${img.name}</div>
                            <div class="x-small text-muted">${img.date}</div>
                        </div>
                    </div>
                </div>
            `);
        });

        if (filtered.length > (state.galPage * state.galSize)) {
            $('#btn-gal-more').removeClass('d-none').off().on('click', () => { state.galPage++; renderGallery(); });
        } else {
            $('#btn-gal-more').addClass('d-none');
        }
    };
    $('#gal-search').on('input', () => { state.galPage = 1; renderGallery(); });

    // --- DASHBOARD ENGINE ---
    const renderDashboard = () => {
        const total = db.length;
        const size = db.reduce((acc, i) => acc + i.size, 0);
        const todayStr = new Date().toISOString().split('T')[0];

        $('#metric-total').text(total);
        $('#metric-downloads').text(state.dlCount);
        $('#metric-today').text(db.filter(i => i.date === todayStr).length);
        $('#metric-size').text((size / 1024).toFixed(1) + " KB");

        const dailyMap = db.reduce((acc, i) => { acc[i.date] = (acc[i.date] || 0) + 1; return acc; }, {});
        const extMap = db.reduce((acc, i) => { acc[i.ext] = (acc[i.ext] || 0) + 1; return acc; }, {});

        if (charts.trend) charts.trend.destroy();
        charts.trend = new Chart(document.getElementById('chartTrend'), {
            type: 'line',
            data: { labels: Object.keys(dailyMap).sort().slice(-30), datasets: [{ label: 'Uploads', data: Object.values(dailyMap), borderColor: '#1266f1', tension: 0.4, fill: true, backgroundColor: 'rgba(18, 102, 241, 0.05)' }] },
            options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });

        if (charts.pie) charts.pie.destroy();
        charts.pie = new Chart(document.getElementById('chartPie'), {
            type: 'doughnut',
            data: { labels: Object.keys(extMap), datasets: [{ data: Object.values(extMap), backgroundColor: ['#1266f1', '#00b74a', '#ffa900', '#f93154', '#39c0ed'] }] },
            options: { plugins: { legend: { position: 'bottom' } } }
        });
    };

    // --- CORE ACTIONS ---
    window.forceDownload = (url, name) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        state.dlCount++;
        localStorage.setItem('codingvila_dl_count', state.dlCount);
    };


    window.copyLink = (url) => {
        navigator.clipboard.writeText(url).then(() => showToast("URL copied to clipboard", "info"));
    };

    let ssPointer = 0;
    window.openView = (id) => {
        const item = db.find(i => i.id == id);
        if (!item) return;
        ssPointer = state.currentGalBatch.findIndex(i => i.id == id);
        $('#modal-img').attr('src', item.url);
        $('#modal-dl').off().on('click', () => forceDownload(item.url, item.name));
        $('#modal-copy').off().on('click', () => copyLink(item.url));
        new mdb.Modal(document.getElementById('viewModal')).show();
    };

    window.startSlideshow = () => {
        if (state.currentGalBatch.length === 0) return showToast("No items to play", "error");
        $('#ss-ui').removeClass('d-none');
        openView(state.currentGalBatch[0].id);
        toggleSS(true);
    };

    window.toggleSS = (start = false) => {
        if (state.ssTimer || !start) {
            clearInterval(state.ssTimer);
            state.ssTimer = null;
            $('#ss-play').html('<i class="fas fa-play"></i>');
        } else {
            $('#ss-play').html('<i class="fas fa-pause"></i>');
            state.ssTimer = setInterval(() => shiftSlide(1), 3000);
        }
    };

    window.shiftSlide = (dir) => {
        ssPointer = (ssPointer + dir + state.currentGalBatch.length) % state.currentGalBatch.length;
        const next = state.currentGalBatch[ssPointer];
        $('#modal-img').attr('src', next.url);
    };

    $('#viewModal').on('hidden.bs.modal', () => { toggleSS(false); $('#ss-ui').addClass('d-none'); });

    // --- ZIP (BINARY SAFE FIX) ---
    //window.processZip = async (mode) => {
    //    let list = [];
    //    if (mode === 'selected') {
    //        const ids = $('.lib-row-check:checked').map(function () { return $(this).data('id'); }).get();
    //        list = db.filter(i => ids.includes(i.id));
    //    } else if (mode === 'gal-selected') {
    //        const ids = $('.gal-row-check:checked').map(function () { return $(this).data('id'); }).get();
    //        list = db.filter(i => ids.includes(i.id));
    //    } else if (mode === 'all') {
    //        list = db;
    //    } else if (mode === 'date' || mode === 'month') {
    //        promptBox(
    //            `Enter ${mode}`,
    //            mode === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM',
    //            (val) => {
    //                if (val) list = db.filter(i => i[mode] === val);
    //            }
    //        );
    //    }

    //    if (list.length === 0) return showToast("No images selected or found", "error");

    //    const zip = new JSZip();
    //    showToast(`Preparing ${list.length} assets...`, "info");

    //    try {
    //        for (let img of list) {
    //            // CORRUPTION FIX: Use arrayBuffer() for reliable binary data transfer
    //            const resp = await fetch(img.url);
    //            const buffer = await resp.arrayBuffer();
    //            zip.file(img.name, buffer);
    //        }
    //        const blob = await zip.generateAsync({ type: "blob" });
    //        saveAs(blob, `Codingvila_Archive_${Date.now()}.zip`);
    //        showToast("ZIP ready for download", "success");
    //    } catch (e) { showToast("Process failed", "error"); }
    //};

    window.processDirectDownload = async (mode) => {
        let list = [];

        if (mode === 'selected') {
            const ids = $('.lib-row-check:checked').map(function () {
                return $(this).data('id');
            }).get();
            list = db.filter(i => ids.includes(i.id));
        }
        else if (mode === 'gal-selected') {
            const ids = $('.gal-row-check:checked').map(function () {
                return $(this).data('id');
            }).get();
            list = db.filter(i => ids.includes(i.id));
        }
        else if (mode === 'all') {
            list = db;
        }

        if (!list.length) {
            showToast("No images selected", "error");
            return;
        }

        showToast(`Downloading ${list.length} images...`, "info");

        await downloadQueue(list, 0);

        showToast("All downloads completed", "success");
    };

    async function downloadQueue(list, index) {
        if (index >= list.length) return;

        const img = list[index];

        try {
            await forceDownloadBlob(img.url, img.name);

            state.dlCount++;
            localStorage.setItem('codingvila_dl_count', state.dlCount);
        }
        catch (e) {
            console.error("Failed:", img.name);
        }

        // ⏳ delay is mandatory
        setTimeout(() => {
            downloadQueue(list, index + 1);
        }, 1200);
    }


    async function forceDownloadBlob(url, filename) {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error("Network error");

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename || 'image';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(blobUrl);
    }


    // --- EXCEL EXPORT (ALL & SELECTED) ---
    window.exportBatchExcel = (mode) => {
        const ids = $('.lib-row-check:checked').map(function () { return $(this).data('id'); }).get();
        let list = (mode === 'selected') ? db.filter(i => ids.includes(i.id)) : db;

        if (list.length === 0) return showToast("Nothing to export", "error");

        // Get root URL dynamically
        const root = window.location.origin; // e.g., https://yourdomain.com

        const mapped = list.map(i => ({
            "Asset Name": i.name,
            // Relative download.html path with root URL
            "Download Link": `HYPERLINK("${root}/download.html?url=${encodeURIComponent(i.url)}&name=${encodeURIComponent(i.name)}","Download")`,
            "Date": i.date,
            "Type": i.ext
        }));

        const ws = XLSX.utils.json_to_sheet([]);

        // Write header
        const headers = Object.keys(mapped[0]);
        headers.forEach((h, i) => {
            ws[XLSX.utils.encode_cell({ r: 0, c: i })] = { v: h };
        });

        // Write data
        mapped.forEach((row, rIndex) => {
            headers.forEach((h, cIndex) => {
                const val = row[h];
                if (h === "Download Link") {
                    // Force Excel to treat it as a formula
                    ws[XLSX.utils.encode_cell({ r: rIndex + 1, c: cIndex })] = { f: val };
                } else {
                    ws[XLSX.utils.encode_cell({ r: rIndex + 1, c: cIndex })] = { v: val };
                }
            });
        });

        // Set sheet range
        ws['!ref'] = XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: mapped.length, c: headers.length - 1 }
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Assets");
        XLSX.writeFile(wb, `Codingvila_Assets_${mode}.xlsx`);
        showToast("Excel generated with clickable download links", "success");
    };


    // --- CLEANUP ENGINE ---
    window.runCleanup = (mode) => {
        let target = "";
        let fn = null;

        if (mode === 'day') { target = $('#clean-day').val(); if (!target) return; fn = (i) => i.date === target; }
        else if (mode === 'month') { target = $('#clean-month').val(); if (!target) return; fn = (i) => i.month === target; }
        else if (mode === 'year') { target = $('#clean-year').val(); if (!target) return; fn = (i) => i.year === target; }
        else if (mode === 'all') { target = "ALL RECORDS"; fn = (i) => true; }

        const matches = db.filter(fn).length;
        if (matches === 0) return showToast("No matches found", "info");

        confirmBox({
            title: "Dangerous Operation",
            message: `You are about to delete <b>${matches}</b> images permanently for <b>${target}</b>. This cannot be undone.`,
            danger: true,
            okText: "Delete Forever"
        }, (res) => {
            if (res) {
                db = db.filter(i => !fn(i));
                localStorage.setItem('codingvila_img_db', JSON.stringify(db));
                showToast("Database Cleansed", "success");
                navigate('dashboard');
            }
        });

    };

    window.deleteItem = (id) => {
        confirmBox({
            title: "Confirm Delete",
            message: "Remove this asset from the database?"
        }, (res) => {
            if (res) {
                db = db.filter(i => i.id != id);
                localStorage.setItem('codingvila_img_db', JSON.stringify(db));
                renderLibrary();
                showToast("Asset Deleted", "info");
            }
        });
    };


    window.showToast = (msg, type) => {
        Toastify({ text: msg, gravity: "bottom", position: "right", style: { background: type === 'success' ? '#00b74a' : (type === 'error' ? '#f93154' : '#1266f1'), borderRadius: '12px' } }).showToast();
    };

    $('#btn-logout').click(() => {
        confirmBox({
            title: "Logout",
            message: "Logout from Codingvila Assets?"
        }, (res) => {
            if (res) {
                sessionStorage.clear();
                location.href = location.pathname;
            }
        });
    });


    $('#lib-check-all').change(function () { $('.lib-row-check').prop('checked', this.checked); });

    window.alertBox = function (title, message) {
        const id = 'cvAlertModal';
        if (!document.getElementById(id)) {
            $('body').append(`
        <div class="modal fade" id="${id}" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title"></h5>
                    </div>
                    <div class="modal-body text-center"></div>
                    <div class="modal-footer justify-content-center">
                        <button class="btn btn-primary" data-mdb-dismiss="modal">OK</button>
                    </div>
                </div>
            </div>
        </div>`);
        }
        $(`#${id} .modal-title`).html(title);
        $(`#${id} .modal-body`).html(message);
        new mdb.Modal(document.getElementById(id)).show();
    };

    window.confirmBox = function (options, callback) {
        const id = 'cvConfirmModal';
        if (!document.getElementById(id)) {
            $('body').append(`
        <div class="modal fade" id="${id}" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header text-white"></div>
                    <div class="modal-body text-center"></div>
                    <div class="modal-footer justify-content-center">
                        <button class="btn btn-light" data-mdb-dismiss="modal">Cancel</button>
                        <button class="btn" id="cvConfirmOk">OK</button>
                    </div>
                </div>
            </div>
        </div>`);
        }

        const modalEl = document.getElementById(id);
        const modal = new mdb.Modal(modalEl);

        $(`#${id} .modal-header`)
            .removeClass('bg-danger bg-primary')
            .addClass(options.danger ? 'bg-danger' : 'bg-primary')
            .html(`<h5 class="modal-title">${options.title || 'Confirm'}</h5>`);

        $(`#${id} .modal-body`).html(options.message || 'Are you sure?');

        $('#cvConfirmOk')
            .removeClass('btn-danger btn-primary')
            .addClass(options.danger ? 'btn-danger' : 'btn-primary')
            .text(options.okText || 'Confirm')
            .off()
            .on('click', () => {
                modal.hide();
                callback(true);
            });

        modal.show();
    };

    window.promptBox = function (title, placeholder, callback) {
        const id = 'cvPromptModal';
        if (!document.getElementById(id)) {
            $('body').append(`
        <div class="modal fade" id="${id}" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title"></h5>
                    </div>
                    <div class="modal-body">
                        <input type="text" class="form-control" id="cvPromptInput">
                    </div>
                    <div class="modal-footer justify-content-center">
                        <button class="btn btn-light" data-mdb-dismiss="modal">Cancel</button>
                        <button class="btn btn-primary" id="cvPromptOk">OK</button>
                    </div>
                </div>
            </div>
        </div>`);
        }

        $(`#${id} .modal-title`).text(title);
        $('#cvPromptInput').val('').attr('placeholder', placeholder);

        const modal = new mdb.Modal(document.getElementById(id));
        $('#cvPromptOk').off().on('click', () => {
            modal.hide();
            callback($('#cvPromptInput').val());
        });

        modal.show();
    };

    window.backupDB = () => {
        const blob = new Blob(
            [JSON.stringify(db, null, 2)],
            { type: "application/json" }
        );
        saveAs(blob, "codingvila_img_backup.json");
    };

    window.restoreDB = (file) => {
        const reader = new FileReader();
        reader.onload = e => {
            db = JSON.parse(e.target.result);
            localStorage.setItem('codingvila_img_db', JSON.stringify(db));
            showToast("Database restored", "success");
            navigate('dashboard');
        };
        reader.readAsText(file);
    };


    // --- INITIALIZATION ---
    const init = () => {
        const isAuth = sessionStorage.getItem('isLoggedIn') === 'true';

        if (!isAuth) {
            // Hard lock app
            $('#app-wrapper').hide();
            $('#login-overlay').show();
            $('body').addClass('overflow-hidden');
            return;
        }

        // Restore authenticated state
        $('#login-overlay').hide();
        $('#app-wrapper').show();
        $('body').removeClass('overflow-hidden');
        navigate('dashboard');
    };
    init();
});