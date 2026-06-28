// =============================================================
// RODTREEP — script.js  (version senior, architecture propre)
// =============================================================

// ─── 1. NAVBAR ───────────────────────────────────────────────
(function initNavbar() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');
    const navbar = document.querySelector('.navbar');

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

    // The scroll listener for navbar collapsing has been removed 
    // since the sidebar is now permanently collapsed and only expands on hover via CSS.

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
        console.log('[RODTREEP] Supabase initialisé ✅');
    } else {
        console.warn('[RODTREEP] Supabase SDK non disponible – mode local activé');
    }
} catch (err) {
    console.error('[RODTREEP] Erreur init Supabase:', err);
}


// ─── 3. CANVAS ───────────────────────────────────────────────
(function initCanvas() {
    // Refs DOM
    const section = document.getElementById('hero');
    const wrapper = document.getElementById('album-wrapper');
    const canvas = document.getElementById('infinite-canvas');
    const uploadInput = document.getElementById('photo-upload');
    const exitBtn = document.getElementById('exit-album-btn');

    if (!wrapper || !canvas) {
        console.error('[RODTREEP] Éléments du canvas introuvables !');
        return;
    }

    console.log('[RODTREEP] Canvas initialisé ✅');

    // État
    // État
    let active = false;
    let dragging = false;
    let tx = 0, ty = 0;
    let ox = 0, oy = 0;          // origin de drag
    let photoCount = 0;
    let zTop = 10;
    const GAP_X = 330; // Espace horizontal entre les photos (240px largeur + 90px d'espace)
    const GAP_Y = 250; // Espace vertical entre les photos (160px hauteur + 90px d'espace)

    // Activation / Désactivation
    const activateAlbum = () => {
        if (active) return;
        active = true;
        section.classList.add('fullscreen-active');
        document.body.style.overflow = 'hidden';
    };

    const deactivateAlbum = (e) => {
        if (e) e.stopPropagation();
        active = false;
        section.classList.remove('fullscreen-active');
        document.body.style.overflow = '';
        // Optionnel : on peut recentrer le canvas en quittant
        // tx = 0; ty = 0;
        // setTransform();
    };

    if (exitBtn) exitBtn.addEventListener('click', deactivateAlbum);

    // Clic sur le fond de la section (hors boutons) active l'exploration
    if (section) {
        section.addEventListener('click', (e) => {
            if (active) return;
            if (e.target.closest('#exit-album-btn')) return;
            if (e.target.closest('.add-photo-btn-glass')) return;
            if (e.target.closest('.hero-content')) return;
            activateAlbum();
        });
    }

    // Helpers
    const setTransform = () => {
        canvas.style.transform = `translate(${tx}px, ${ty}px)`;
    };

    // Spirale carrée : n=1 au centre, n=2 au-dessus, n=3 à droite du 2, puis carré
    const getRingPos = (n) => {
        // Photo 1 = centre exact
        if (n === 1) return { x: 0, y: 0 };

        // Trouver dans quel anneau on est (anneau r contient 8*r positions)
        let ring = 1;
        let prevTotal = 1; // nb de photos avant cet anneau
        while (prevTotal + ring * 8 < n) {
            prevTotal += ring * 8;
            ring++;
        }

        const pos = n - prevTotal - 1; // 0-indexé dans l'anneau
        const r = ring;

        // Segment 1 - Top (gauche→droite) : (0,-r) → (r,-r)  = r+1 cases
        // Segment 2 - Droite (haut→bas)  : (r,-(r-1)) → (r,r) = 2r cases
        // Segment 3 - Bas (droite→gauche): (r-1,r) → (-r,r)  = 2r cases
        // Segment 4 - Gauche (bas→haut)  : (-r,r-1) → (-r,-r) = 2r cases
        // Segment 5 - Top fin            : (-(r-1),-r) → (-1,-r) = r-1 cases
        const cTOP = r + 1;
        const cRIGHT = cTOP + 2 * r;
        const cBOTTOM = cRIGHT + 2 * r;
        const cLEFT = cBOTTOM + 2 * r;

        let gx, gy;

        if (pos < cTOP) {
            gx = pos;
            gy = -r;
        } else if (pos < cRIGHT) {
            const i = pos - cTOP;
            gx = r;
            gy = -(r - 1) + i;
        } else if (pos < cBOTTOM) {
            const i = pos - cRIGHT;
            gx = (r - 1) - i;
            gy = r;
        } else if (pos < cLEFT) {
            const i = pos - cBOTTOM;
            gx = -r;
            gy = (r - 1) - i;
        } else {
            const i = pos - cLEFT;
            gx = -(r - 1) + i;
            gy = -r;
        }

        return { x: gx * GAP_X, y: gy * GAP_Y };
    };



    // ── Drag du canvas ─────────────────────────────────────
    const startDrag = (clientX, clientY, target) => {
        if (!active) return;
        if (target.closest('.photo-item')) return;
        if (target.closest('.add-photo-placeholder')) return;
        dragging = true;
        wrapper.style.cursor = 'grabbing';
        ox = clientX - tx;
        oy = clientY - ty;
    };

    const doDrag = (clientX, clientY) => {
        if (!dragging) return;
        tx = clientX - ox;
        ty = clientY - oy;
        setTransform();
    };

    const endDrag = () => {
        if (dragging) {
            dragging = false;
            wrapper.style.cursor = 'grab';
        }
    };

    // Souris
    wrapper.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY, e.target));
    window.addEventListener('mousemove', (e) => doDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', endDrag);

    // Tactile
    wrapper.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            startDrag(e.touches[0].clientX, e.touches[0].clientY, e.target);
        }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            doDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });
    window.addEventListener('touchend', endDrag);

    // ── Trackpad / scroll — capturé sur toute la section pour ne jamais rater un geste ──
    // On écoute sur la section ET sur le wrapper pour couvrir tous les éléments (photos, texte, etc.)
    const onWheel = (e) => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();
        tx -= e.deltaX;
        ty -= e.deltaY;
        setTransform();
    };
    section.addEventListener('wheel', onWheel, { passive: false });
    wrapper.addEventListener('wheel', onWheel, { passive: false });

    // ── Navigation au clavier (Flèches directionnelles) ────
    window.addEventListener('keydown', (e) => {
        if (!active) return;
        const step = 50; // Vitesse de déplacement au clavier
        switch (e.key) {
            case 'ArrowUp':
                ty += step;
                e.preventDefault();
                break;
            case 'ArrowDown':
                ty -= step;
                e.preventDefault();
                break;
            case 'ArrowLeft':
                tx += step;
                e.preventDefault();
                break;
            case 'ArrowRight':
                tx -= step;
                e.preventDefault();
                break;
        }
        setTransform();
    });

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
        const ext = file.name.split('.').pop().toLowerCase();
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
            console.log('[RODTREEP] Média sauvegardé sur Supabase ✅', name);

        } catch (err) {
            console.error('[RODTREEP] Erreur Supabase, fallback local:', err);
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

        const placeholder = canvas.querySelector(`.photo-placeholder[data-index="${photoCount}"]`);
        if (placeholder) {
            placeholder.remove();
        }

        const div = document.createElement('div');
        div.className = 'photo-item';
        div.style.left = pos.x + 'px';
        div.style.top = pos.y + 'px';
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
            div.appendChild(vid);
        } else {
            const img = document.createElement('img');
            img.src = src;
            img.draggable = false;
            div.appendChild(img);
        }

        // Boutons
        const actions = document.createElement('div');
        actions.className = 'photo-actions';

        // Télécharger
        const dl = document.createElement('a');
        dl.className = 'action-btn download-btn';
        dl.href = src;
        dl.download = 'rodtreep_photo.jpg';
        dl.title = 'Télécharger';
        dl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
        dl.addEventListener('mousedown', ev => ev.stopPropagation());

        // Supprimer
        const del = document.createElement('button');
        del.className = 'action-btn delete-btn';
        del.title = 'Supprimer';
        del.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
        del.addEventListener('mousedown', async (ev) => {
            ev.stopPropagation();
            // Récupérer la position de la photo avant de la supprimer
            const deletedLeft = div.style.left;
            const deletedTop = div.style.top;
            const deletedIndex = div.dataset.photoIndex;
            div.remove();
            // Recréer un placeholder gris à la place de la photo supprimée
            if (deletedIndex) {
                const ph = document.createElement('div');
                ph.className = 'photo-placeholder';
                ph.style.left = deletedLeft;
                ph.style.top = deletedTop;
                ph.style.transform = 'translate(-50%,-50%)';
                ph.dataset.index = deletedIndex;
                canvas.appendChild(ph);
            }
            if (db && dbId) { try { await db.from('photos').delete().eq('id', dbId); } catch (e) { } }
            if (db && storagePath) { try { await db.storage.from(BUCKET).remove([storagePath]); } catch (e) { } }
        });

        actions.appendChild(dl);
        actions.appendChild(del);
        div.appendChild(actions);
        // Mémoriser l'index pour pouvoir recréer le placeholder si suppression
        div.dataset.photoIndex = photoCount;
        canvas.appendChild(div);

        console.log('[RODTREEP] Photo ajoutée au canvas ✅ pos:', pos);
    }

    // ── Générer les placeholders gris ─────────────────────
    function initPlaceholders() {
        const MAX_PLACEHOLDERS = 100; // Grille dense de blocs gris
        for (let i = photoCount + 1; i <= MAX_PLACEHOLDERS; i++) {
            // Ne pas créer de doublon si un placeholder existe déjà à cet index
            if (canvas.querySelector(`.photo-placeholder[data-index="${i}"]`)) continue;
            const pos = getRingPos(i);
            const div = document.createElement('div');
            div.className = 'photo-placeholder';
            div.style.left = pos.x + 'px';
            div.style.top = pos.y + 'px';
            div.style.transform = 'translate(-50%,-50%)';
            div.dataset.index = i;
            canvas.appendChild(div);
        }
    }

    // ── Charger les photos depuis Supabase au démarrage ───
    async function loadPhotos() {
        if (!db) {
            console.log('[RODTREEP] Mode local – pas de chargement Supabase');
            initPlaceholders();
            return;
        }
        try {
            const { data, error } = await db
                .from('photos')
                .select('*')
                .order('created_at', { ascending: true });
            if (error) throw error;
            (data || []).forEach(p => addPhoto(p.public_url, p.id, p.storage_path));
            console.log(`[RODTREEP] ${(data || []).length} photo(s) chargée(s) depuis Supabase ✅`);
        } catch (err) {
            console.error('[RODTREEP] Impossible de charger les photos:', err);
        }
        initPlaceholders();
    }

    loadPhotos();

})(); // fin initCanvas

// ─── 4. CARTE LEAFLET (PARCOURS) ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer || typeof L === 'undefined') return;

    // Initialisation — interaction désactivée pour un effet "carte affiche"
    const map = L.map('map-container', {
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false
    }).setView([40.0, -4.0], 6); // Centré sur Péninsule Ibérique

    // Ajout d'un VRAI fond de carte élégant et très clair
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    const rootStyles = getComputedStyle(document.documentElement);
    const primaryColor = rootStyles.getPropertyValue('--primary-color').trim() || '#A27BFF';
    const heroBg = rootStyles.getPropertyValue('--hero-bg').trim() || '#F0544F';

    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
        .then(response => response.json())
        .then(data => {
            const allowed = ['FRA', 'ESP', 'PRT', 'AND'];
            const filteredData = {
                type: 'FeatureCollection',
                features: data.features.filter(feature => allowed.includes(feature.id))
            };

            L.geoJSON(filteredData, {
                style: {
                    color: heroBg,          // Contour Corail
                    weight: 2.5,
                    fillColor: primaryColor, // Remplissage Lilas
                    fillOpacity: 0.12,
                    opacity: 1
                }
            }).addTo(map);

            // Vue englobant toute la France jusqu'au Portugal
            const routeBounds = L.latLngBounds(
                L.latLng(36.0, -9.5), // SW : sud Portugal
                L.latLng(51.5, 8.5)  // NE : nord/est de la France
            );
            map.fitBounds(routeBounds, { padding: [20, 20] });
        })
        .catch(err => console.error('Erreur chargement GeoJSON:', err));
});

// ─── 5. STATS PARCOURS (TOGGLE DÉTAILS) ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggle-parcours-details');
    const detailsContent = document.getElementById('parcours-details-content');

    if (toggleBtn && detailsContent) {
        toggleBtn.addEventListener('click', () => {
            toggleBtn.classList.toggle('open');
            detailsContent.classList.toggle('open');
        });
    }
});

// ─── 6. CAROUSEL LOGEMENTS ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('logements-track');
    const btnPrev = document.getElementById('logement-prev');
    const btnNext = document.getElementById('logement-next');
    const dotsContainer = document.getElementById('logements-dots');

    if (!track || !btnPrev || !btnNext || !dotsContainer) return;

    const cards = Array.from(track.children);
    let currentIndex = 0;
    const totalCards = cards.length;

    // Create dots
    cards.forEach((_, index) => {
        const dot = document.createElement('div');
        dot.classList.add('logement-dot');
        if (index === 0) dot.classList.add('active');
        dot.addEventListener('click', () => goToSlide(index));
        dotsContainer.appendChild(dot);
    });

    const dots = Array.from(dotsContainer.children);

    function updateCarousel() {
        // Move track
        track.style.transform = `translateX(-${currentIndex * 100}%)`;

        // Update dots
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentIndex);
        });

        // Update buttons state
        btnPrev.style.opacity = currentIndex === 0 ? '0.5' : '1';
        btnPrev.style.cursor = currentIndex === 0 ? 'default' : 'pointer';

        btnNext.style.opacity = currentIndex === totalCards - 1 ? '0.5' : '1';
        btnNext.style.cursor = currentIndex === totalCards - 1 ? 'default' : 'pointer';
    }

    function goToSlide(index) {
        if (index < 0 || index >= totalCards) return;
        currentIndex = index;
        updateCarousel();
    }

    btnPrev.addEventListener('click', () => {
        if (currentIndex > 0) goToSlide(currentIndex - 1);
    });

    btnNext.addEventListener('click', () => {
        if (currentIndex < totalCards - 1) goToSlide(currentIndex + 1);
    });

    // Touch support for swiping
    let startX = 0;
    let currentTranslate = 0;
    let prevTranslate = 0;
    let isDragging = false;

    track.addEventListener('touchstart', touchStart, { passive: true });
    track.addEventListener('touchend', touchEnd);
    track.addEventListener('touchmove', touchMove, { passive: true });

    function touchStart(event) {
        startX = event.touches[0].clientX;
        isDragging = true;

        // Calculate px value of -currentIndex * 100%
        const cardWidth = track.clientWidth;
        prevTranslate = -currentIndex * cardWidth;

        track.style.transition = 'none';
    }

    function touchMove(event) {
        if (!isDragging) return;
        const currentX = event.touches[0].clientX;
        const diff = currentX - startX;
        currentTranslate = prevTranslate + diff;
        track.style.transform = `translateX(${currentTranslate}px)`;
    }

    function touchEnd(event) {
        isDragging = false;
        track.style.transition = 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)';

        const movedBy = currentTranslate - prevTranslate;

        // Threshold for swipe
        if (movedBy < -50 && currentIndex < totalCards - 1) {
            currentIndex += 1;
        } else if (movedBy > 50 && currentIndex > 0) {
            currentIndex -= 1;
        }

        updateCarousel();
    }

    // Handle window resize for track width recalculation if needed
    window.addEventListener('resize', () => {
        updateCarousel();
    });

    // Initialize
    updateCarousel();
});

// ─── 6. ACTIVITÉS (NUAGE DE MOTS) ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('activity-modal');
    const openBtn = document.getElementById('open-activity-modal-btn');
    const closeBtn = document.getElementById('close-activity-modal-btn');
    const form = document.getElementById('add-activity-form');
    const wordcloudContainer = document.getElementById('wordcloud-container');

    if (!modal || !openBtn || !closeBtn || !form || !wordcloudContainer) return;

    // Définition des couleurs correspondant aux variables CSS
    const cityColors = {
        barcelone: 'var(--city-barcelone)',
        salamanque: 'var(--city-salamanque)',
        porto: 'var(--city-porto)',
        coja: 'var(--city-coja)',
        colares: 'var(--city-colares)',
        comporta: 'var(--city-comporta)'
    };

    // État local (Fallback)
    let activities = JSON.parse(localStorage.getItem('roadtreep_activities')) || [];
    let selectedActivityIndex = -1; // Pour gérer la sélection/suppression

    // Sauvegarder dans LocalStorage (Fallback)
    function saveActivitiesLocal() {
        localStorage.setItem('roadtreep_activities', JSON.stringify(activities));
    }

    // Charger les activités depuis Supabase
    async function loadActivities() {
        if (!db) {
            console.log('[RODTREEP] Mode local – pas de chargement Supabase pour les activités');
            renderWordCloud();
            return;
        }
        try {
            const { data, error } = await db
                .from('activities')
                .select('*')
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                // Remplacer l'état local par les données du serveur
                activities = data;
                saveActivitiesLocal(); // Mettre à jour le cache local
            }
            console.log(`[RODTREEP] ${(data || []).length} activité(s) chargée(s) depuis Supabase ✅`);
        } catch (err) {
            console.error('[RODTREEP] Impossible de charger les activités (fallback local):', err);
        }
        renderWordCloud();
    }

    // Fonction pour calculer la taille selon les votes
    function getWordStyles(votes) {
        const baseSize = 1.2;
        const multiplier = 0.3; // +0.3rem par vote
        const fontSize = baseSize + (votes * multiplier);
        
        // Marge aléatoire pour disperser un peu plus
        const margin = Math.random() * 20; // px
        
        return {
            fontSize: `${Math.min(fontSize, 4.5)}rem`, // Capacité max à 4.5rem
            margin: `${margin}px`
        };
    }

    // Afficher le nuage de mots
    function renderWordCloud() {
        // Nettoyer uniquement les mots et messages
        const oldElements = wordcloudContainer.querySelectorAll('.wordcloud-word, .empty-msg');
        oldElements.forEach(el => el.remove());
        
        selectedActivityIndex = -1;
        wordcloudContainer.classList.remove('has-selection');
        const controlBar = document.querySelector('.activities-control-bar');
        if (controlBar) controlBar.classList.remove('has-selection');
        
        const actionButtons = document.getElementById('activity-actions');
        if (actionButtons) actionButtons.classList.remove('active');
        
        // Si vide, afficher un message stylisé
        if (activities.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-msg';
            emptyMsg.textContent = "Aucune activité pour le moment. Cliquez sur le + pour commencer !";
            emptyMsg.style.color = "rgba(0,0,0,0.3)";
            emptyMsg.style.fontStyle = "italic";
            wordcloudContainer.appendChild(emptyMsg);
            return;
        }

        activities.forEach((act, index) => {
            const span = document.createElement('span');
            span.className = 'wordcloud-word';
            span.textContent = act.name;
            span.style.color = cityColors[act.city] || 'var(--text-color)';
            
            const styles = getWordStyles(act.votes || 0);
            span.style.fontSize = styles.fontSize;
            span.style.margin = styles.margin;
            
            // Sélection pour actions
            span.addEventListener('click', (e) => {
                e.stopPropagation(); // Évite que le clic sur le container désélectionne
                
                // Désélectionner tout
                wordcloudContainer.querySelectorAll('.wordcloud-word').forEach(w => w.classList.remove('selected'));
                
                // Sélectionner celui-ci
                span.classList.add('selected');
                wordcloudContainer.classList.add('has-selection');
                if (controlBar) controlBar.classList.add('has-selection');
                
                selectedActivityIndex = index;
                
                if (actionButtons) actionButtons.classList.add('active');
            });
            
            wordcloudContainer.appendChild(span);
        });
    }
    
    // Clic sur le container vide -> désélectionner
    wordcloudContainer.addEventListener('click', () => {
        wordcloudContainer.querySelectorAll('.wordcloud-word').forEach(w => w.classList.remove('selected'));
        wordcloudContainer.classList.remove('has-selection');
        const controlBar = document.querySelector('.activities-control-bar');
        if (controlBar) controlBar.classList.remove('has-selection');
        selectedActivityIndex = -1;
        const actionButtons = document.getElementById('activity-actions');
        if (actionButtons) actionButtons.classList.remove('active');
    });

    // Bouton de suppression
    const deleteBtn = document.getElementById('delete-activity-zone');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (selectedActivityIndex > -1) {
                const actToDelete = activities[selectedActivityIndex];
                
                // UI optimiste
                activities.splice(selectedActivityIndex, 1);
                saveActivitiesLocal();
                renderWordCloud();
                
                // Supabase
                if (db && actToDelete.name && actToDelete.city) {
                    try {
                        const { error } = await db.from('activities')
                            .delete()
                            .match({ name: actToDelete.name, city: actToDelete.city });
                        if (error) throw error;
                        console.log('[RODTREEP] Activité supprimée de Supabase ✅');
                    } catch (err) {
                        console.error('[RODTREEP] Erreur lors de la suppression sur Supabase:', err);
                    }
                }
            }
        });
    }

    // Bouton de Vote
    const voteBtn = document.getElementById('vote-activity-btn');
    if (voteBtn) {
        voteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (selectedActivityIndex > -1) {
                const actToVote = activities[selectedActivityIndex];
                
                // Incrémentation optimiste
                actToVote.votes = (actToVote.votes || 0) + 1;
                saveActivitiesLocal();
                renderWordCloud();
                
                // Supabase Update
                if (db && actToVote.name && actToVote.city) {
                    try {
                        const { error } = await db.from('activities')
                            .update({ votes: actToVote.votes })
                            .match({ name: actToVote.name, city: actToVote.city });
                        if (error) throw error;
                        console.log('[RODTREEP] Vote sauvegardé sur Supabase ✅');
                    } catch (err) {
                        console.error('[RODTREEP] Erreur lors du vote sur Supabase:', err);
                    }
                }
            }
        });
    }

    // Gestion modale
    openBtn.addEventListener('click', () => {
        modal.classList.add('active');
        document.getElementById('activity-name').focus();
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    // Fermer au clic sur le fond
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    // Ajouter une activité
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nameInput = document.getElementById('activity-name');
        const cityInput = document.querySelector('input[name="activity-city"]:checked');
        
        if (nameInput.value.trim() !== '' && cityInput) {
            const newAct = {
                name: nameInput.value.trim(),
                city: cityInput.value,
                votes: 0
            };
            
            // UI optimiste : on ajoute tout de suite
            activities.push(newAct);
            saveActivitiesLocal();
            renderWordCloud();
            
            // Envoi Supabase
            if (db) {
                try {
                    const { error } = await db.from('activities').insert([newAct]);
                    if (error) throw error;
                    console.log('[RODTREEP] Activité sauvegardée sur Supabase ✅');
                } catch (err) {
                    console.error('[RODTREEP] Erreur lors de la sauvegarde sur Supabase:', err);
                }
            }
            
            // Reset et fermer
            nameInput.value = '';
            cityInput.checked = false;
            modal.classList.remove('active');
        }
    });

    // Init
    loadActivities();
});

// ─── 8. ANIMATION COMPTEURS (STATS) ─────────────────────────
(function initCountUp() {
    const counters = document.querySelectorAll('.count-up');
    if (!counters.length) return;

    const animateCount = (el) => {
        const target = parseInt(el.getAttribute('data-target'), 10);
        const duration = 2000; // 2 secondes
        const startTime = performance.now();

        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function (ease-out) : ralentit vers la fin
            const easeOut = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            
            el.innerText = Math.floor(easeOut * target);

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                el.innerText = target;
            }
        };

        requestAnimationFrame(update);
    };

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCount(entry.target);
                obs.unobserve(entry.target); // Jouer l'animation une seule fois
            }
        });
    }, { threshold: 0.5 }); // Se déclenche quand 50% de l'élément est visible

    counters.forEach(counter => observer.observe(counter));
})();
