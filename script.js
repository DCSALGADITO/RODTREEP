// =============================================================
// ROADTREEP — script.js  (version senior, architecture propre)
// =============================================================

// ─── 1. NAVBAR ───────────────────────────────────────────────
(function initNavbar() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu   = document.querySelector('.nav-menu');
    const navLinks  = document.querySelectorAll('.nav-link');
    const navbar    = document.querySelector('.navbar');

    if (!hamburger || !navMenu) return;

    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
        document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
            document.body.style.overflow = '';
        });
    });

    window.addEventListener('scroll', () => {
        if (!navbar) return;
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(219,234,254,0.97)';
            navbar.style.boxShadow  = '0 4px 30px rgba(0,0,0,0.07)';
        } else {
            navbar.style.background = 'rgba(219,234,254,0.7)';
            navbar.style.boxShadow  = 'none';
        }
    });

    // Highlight active nav link on scroll
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                navLinks.forEach(l => {
                    l.classList.toggle('active', l.getAttribute('href') === '#' + id);
                });
            }
        });
    }, { rootMargin: '-45% 0px -45% 0px' });

    document.querySelectorAll('section').forEach(s => observer.observe(s));
})();


// ─── 2. SUPABASE ─────────────────────────────────────────────
const SUPABASE_URL = 'https://lnoxgsakxfbshoxojdud.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxub3hnc2FreGZic2hveG9qZHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MDg4MzYsImV4cCI6MjA5ODA4NDgzNn0.ous2BiiHWQj0relOl4xocsRiWqhVDhXCtEyB29k70Yk';
const BUCKET = 'album_photos';

let db = null; // client Supabase, null = mode local

try {
    // supabase.min.js expose window.supabase (UMD build)
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[ROADTREEP] Supabase initialisé ✅');
    } else {
        console.warn('[ROADTREEP] Supabase SDK non disponible – mode local activé');
    }
} catch (err) {
    console.error('[ROADTREEP] Erreur init Supabase:', err);
}


// ─── 3. CANVAS ───────────────────────────────────────────────
(function initCanvas() {
    // Refs DOM
    const section      = document.getElementById('album');
    const wrapper      = document.getElementById('album-wrapper');
    const canvas       = document.getElementById('infinite-canvas');
    const uploadInput  = document.getElementById('photo-upload');
    const exitBtn      = document.getElementById('exit-album-btn');

    if (!wrapper || !canvas) {
        console.error('[ROADTREEP] Éléments du canvas introuvables !');
        return;
    }

    console.log('[ROADTREEP] Canvas initialisé ✅');

    // État
    let active    = true;
    let dragging  = false;
    let tx = 0, ty = 0;
    let ox = 0, oy = 0;          // origin de drag
    let photoCount    = 0;
    let zTop          = 10;
    const RING_GAP    = 350;

    // Helpers
    const setTransform = () => {
        canvas.style.transform = `translate(${tx}px, ${ty}px)`;
    };

    const getRingPos = (n) => {
        let ring = 1, prev = 0, cap = 8;
        while (n > prev + cap) { 
            prev += cap; 
            ring++; 
            cap = ring * 8; 
        }
        const idx = n - prev - 1;
        
        const sideLen = ring * 2;
        const side = Math.floor(idx / sideLen);
        const pos = idx % sideLen;
        
        const D = ring * RING_GAP;
        const step = RING_GAP;
        
        let x = 0, y = 0;
        
        if (side === 0) {
            x = -D + pos * step;
            y = -D;
        } else if (side === 1) {
            x = D;
            y = -D + pos * step;
        } else if (side === 2) {
            x = D - pos * step;
            y = D;
        } else if (side === 3) {
            x = -D;
            y = D - pos * step;
        }
        
        // Ajout d'une toute petite variation aléatoire (optionnelle) pour faire naturel, 
        // décommentez si besoin :
        // x += (Math.random() - 0.5) * 20;
        // y += (Math.random() - 0.5) * 20;

        return { x, y };
    };



    // ── Drag du canvas ─────────────────────────────────────
    wrapper.addEventListener('mousedown', (e) => {
        if (!active) return;
        // Ne pas dragger depuis une photo ou un bouton d'action
        if (e.target.closest('.photo-item')) return;
        if (e.target.closest('.add-photo-placeholder')) return;
        dragging = true;
        wrapper.style.cursor = 'grabbing';
        ox = e.clientX - tx;
        oy = e.clientY - ty;
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        tx = e.clientX - ox;
        ty = e.clientY - oy;
        setTransform();
    });

    window.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            wrapper.style.cursor = 'grab';
        }
    });

    // ── Trackpad / scroll ──────────────────────────────────
    wrapper.addEventListener('wheel', (e) => {
        if (!active) return;
        e.preventDefault();
        tx -= e.deltaX;
        ty -= e.deltaY;
        setTransform();
    }, { passive: false });

    // ── Upload photos ──────────────────────────────────────
    if (uploadInput) {
        uploadInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
            e.target.value = '';

            for (const file of files) {
                if (db) {
                    await uploadToSupabase(file);
                } else {
                    showLocalPhoto(file);
                }
            }
        });
    }

    // ── Upload vers Supabase ───────────────────────────────
    async function uploadToSupabase(file) {
        const ext  = file.name.split('.').pop().toLowerCase();
        const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

        try {
            const { error: upErr } = await db.storage.from(BUCKET).upload(name, file);
            if (upErr) throw upErr;

            const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(name);
            const url = urlData.publicUrl;

            const publicUrl = urlData.publicUrl;

            const { data: dbData, error: dbErr } = await db
                .from('photos')
                .insert([{ storage_path: name, public_url: publicUrl }])
                .select()
                .single();
            if (dbErr) throw dbErr;

            const isVideo = file.type.startsWith('video/');
            addPhoto(publicUrl, dbData.id, name, isVideo);
            console.log('[ROADTREEP] Média sauvegardé sur Supabase ✅', name);

        } catch (err) {
            console.error('[ROADTREEP] Erreur Supabase, fallback local:', err);
            showLocalPhoto(file); // fallback : affichage local quand même
        }
    }

    // ── Affichage local (sans Supabase) ───────────────────
    function showLocalPhoto(file) {
        const reader = new FileReader();
        const isVideo = file.type.startsWith('video/');
        reader.onload = (ev) => addPhoto(ev.target.result, null, null, isVideo);
        reader.readAsDataURL(file);
    }

    // ── Ajout d'une photo sur le canvas ───────────────────
    function addPhoto(src, dbId, storagePath, isVideo = false) {
        if (!canvas) return;
        
        // Si isVideo n'est pas fourni localement, on tente de deviner d'après le chemin
        if (!isVideo && storagePath) {
            isVideo = !!storagePath.match(/\.(mp4|webm|ogg|mov)$/i);
        }

        photoCount++;
        const pos = getRingPos(photoCount);

        const div = document.createElement('div');
        div.className    = 'photo-item';
        div.style.left   = pos.x + 'px';
        div.style.top    = pos.y + 'px';
        div.style.transform = 'translate(-50%,-50%)';
        div.style.zIndex = zTop++;
        if (dbId) div.dataset.id = dbId;

        // Image ou Vidéo
        if (isVideo) {
            const vid = document.createElement('video');
            vid.src = src;
            vid.autoplay = true;
            vid.loop = true;
            vid.muted = true;
            vid.playsInline = true;
            vid.draggable = false;
            vid.style.maxWidth = '300px';
            vid.style.maxHeight = '300px';
            vid.style.objectFit = 'cover';
            vid.style.display = 'block';
            div.appendChild(vid);
        } else {
            const img = document.createElement('img');
            img.src       = src;
            img.draggable = false;
            div.appendChild(img);
        }

        // Boutons
        const actions = document.createElement('div');
        actions.className = 'photo-actions';

        // Télécharger
        const dl = document.createElement('a');
        dl.className = 'action-btn download-btn';
        dl.href      = src;
        dl.download  = 'roadtreep_photo.jpg';
        dl.title     = 'Télécharger';
        dl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
        dl.addEventListener('mousedown', ev => ev.stopPropagation());

        // Supprimer
        const del = document.createElement('button');
        del.className = 'action-btn delete-btn';
        del.title     = 'Supprimer';
        del.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
        del.addEventListener('mousedown', async (ev) => {
            ev.stopPropagation();
            div.remove();
            if (db && dbId)        { try { await db.from('photos').delete().eq('id', dbId); } catch(e){} }
            if (db && storagePath) { try { await db.storage.from(BUCKET).remove([storagePath]); } catch(e){} }
        });

        actions.appendChild(dl);
        actions.appendChild(del);
        div.appendChild(actions);
        canvas.appendChild(div);

        makeDraggable(div);
        console.log('[ROADTREEP] Photo ajoutée au canvas ✅ pos:', pos);
    }

    // ── Rendre une photo déplaçable ───────────────────────
    function makeDraggable(el) {
        let on = false, sx = 0, sy = 0, il = 0, it = 0;

        el.addEventListener('mousedown', (e) => {
            if (!active) return;
            if (e.target.closest('.action-btn')) return;
            e.stopPropagation();
            on = true;
            el.style.zIndex = zTop++;
            el.style.cursor = 'grabbing';
            sx = e.clientX; sy = e.clientY;
            il = parseFloat(el.style.left)  || 0;
            it = parseFloat(el.style.top)   || 0;
        });

        window.addEventListener('mousemove', (e) => {
            if (!on) return;
            el.style.left = (il + e.clientX - sx) + 'px';
            el.style.top  = (it + e.clientY - sy) + 'px';
        });

        window.addEventListener('mouseup', () => {
            if (on) { on = false; el.style.cursor = 'pointer'; }
        });
    }

    // ── Charger les photos depuis Supabase au démarrage ───
    async function loadPhotos() {
        if (!db) { console.log('[ROADTREEP] Mode local – pas de chargement Supabase'); return; }
        try {
            const { data, error } = await db
                .from('photos')
                .select('*')
                .order('created_at', { ascending: true });
            if (error) throw error;
            (data || []).forEach(p => addPhoto(p.public_url, p.id, p.storage_path));
            console.log(`[ROADTREEP] ${(data||[]).length} photo(s) chargée(s) depuis Supabase ✅`);
        } catch (err) {
            console.error('[ROADTREEP] Impossible de charger les photos:', err);
        }
    }

    loadPhotos();

})(); // fin initCanvas
