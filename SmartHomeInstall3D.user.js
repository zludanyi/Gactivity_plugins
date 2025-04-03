// ==UserScript==
// @name         3D SVG Multi-Level Floorplan with Declarative Rooms
// @version      2.4
// @description  Enhanced 3D SVG Multi-level floorplan with declarative room generation, SVG control icons, and Codrops animations
// @author       ZLudany
// @match        https://home.google.com/*
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    // Styles
    const styles = `
        .container {
            width: 150px;
            height: 415px;
            display: flex;
            flex-direction: column;
            position: fixed;
            top: 170px;
            right: 150px;
            background: #222;
            z-index: 10000000;
        }
        .map {
            width: 100%;
            height: 300px;
            position: relative;
            perspective: 1000px;
            perspective-origin: 50% 50%;
        }
        .map__levels {
            width: 150px;
            height: 400px;
            display: flex;
            transition: transform 0.3s;
            transform-style: preserve-3d;
        }
        .map__space {
            cursor: move;
            transition: fill-opacity 0.8s;
            fill-opacity: 0.6;
        }
        .map__space:hover {
            fill-opacity: 0.8;
        }
        .map__space--selected {
            fill-opacity: 1;
        }
        .map__pin {
            width: 8px;
            height: 8px;
            z-index: 9999;
            transform-style: preserve-3d;
            opacity: 0;
            transform: translate3d(0, -20px, -20px);
            transition: opacity 0.3s, transform 0.3s;
            transition-timing-function: cubic-bezier(0.2, 1, 0.3, 1);
        }
        .map__pin--active {
            opacity: 1;
            transform: translate3d(0, 0, 0);
        }
        .map__level {
            width: 100%;
            height: 100%;
            display: flex;
            transition: opacity 1s, transform 1s;
            transition-timing-function: cubic-bezier(0.7, 0, 0.3, 1);
            transform-style: preserve-3d;
        }
        .controls {
            width: 100%;
            height: 100px;
            display: flex;
            flex-direction: column;
            background: #444;
        }
        .controls__btn {
            width: 100%;
            height: 25px;
            background: none;
            border: none;
            color: #ccc;
            font-size: 1em;
            cursor: pointer;
            transition: color 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .controls__btn:hover {
            color: #fff;
        }
        .controls__level {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1em;
            color: #ccc;
            cursor: pointer;
            transition: color 0.3s;
        }
        .controls__level:hover {
            color: #fff;
        }
        .controls__btn--reset {
            height: 25px;
            font-size: 0.8em;
        }
        .locations {
            width: 100%;
            height: 15px;
            overflow-y: auto;
            background: #444;
        }
        .locations__list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .locations__item {
            display: block;
        }
        .locations__link {
            display: block;
            padding: 1px 2px;
            font-size: 6px;
            color: #ccc;
            text-decoration: none;
        }
        .content {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
        }
        .content__item {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            padding: 2em;
            background: rgba(0, 0, 0, 0.9);
            color: #fff;
            opacity: 0;
            transform: translate3d(0, 50px, 0);
            transition: opacity 0.3s, transform 0.3s;
        }
        .content__item--current {
            opacity: 1;
            transform: translate3d(0, 0, 0);
            pointer-events: auto;
        }
        .icon {
            display: block;
            width: 1em;
            height: 1em;
            margin: 0 auto;
            fill: currentColor;
        }
        .icon--pin { width: 100%; height: 100%; }
        .icon--levels { width: 1em; height: 1em; }
        .icon--cross { width: 1em; height: 1em; }
        .icon--prev { width: 1em; height: 1em; }
        .icon--next { width: 1em; height: 1em; }
        .drag-point {
            cursor: pointer;
            fill: #fff;
            stroke: #000;
            stroke-width: 0.5;
        }
    `;
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);

    // Default floors structure
    const defaultFloors = [
        { name: 'Ground Floor', z: 0, rooms: [
            { name: 'Entryway', x: 20, y: 30, width: 4, height: 11 },
            { name: 'Passage', width: 5, height: 3, neighbours: [{ neighbour: 'Entryway', neighbouring: 'BOTTOMRIGHT' }] },
            { name: 'Master Bedroom', width: 15, height: 8, neighbours: [{ neighbour: 'Passage', neighbouring: 'TOPRIGHT' }] }
        ]},
        { name: 'First Floor', z: 1, rooms: [
            { name: 'Living Room', width: 9, height: 13, neighbours: [{ neighbour: 'Wellness Room', neighbouring: 'BOTTOMLEFT' }] },
            { name: 'Wellness Room', width: 8, height: 6 }
        ]},
        { name: 'Second Floor', z: 2, rooms: [
            { name: 'Office', width: 5, height: 6, neighbours: [{ neighbour: 'Living Room', neighbouring: 'TOPLEFTIN' }] }
        ]}
    ];

    // Default pins structure
    let defaultPins = [
        { "Office": [{ x: 2.5, y: 3, type: "default", description: "" }] },
        { "Entryway": [{ x: 2, y: 5.5, type: "default", description: "" }] },
        { "Passage": [{ x: 2.5, y: 1.5, type: "default", description: "" }] },
        { "Master Bedroom": [{ x: 7.5, y: 4, type: "default", description: "" }] },
        { "Living Room": [{ x: 4.5, y: 6.5, type: "default", description: "" }] },
        { "Wellness Room": [{ x: 4, y: 3, type: "default", description: "" }] }
    ];

    // IndexedDB setup
    const dbName = "FloorplanDB";
    const dbVersion = 1;
    let db;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, dbVersion);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                db.createObjectStore("floors", { keyPath: "name" });
                db.createObjectStore("pins", { keyPath: "roomName" });
            };
            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function loadFromDB(storeName) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveToDB(storeName, data) {
        const db = await openDB();
        const transaction = db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        data.forEach(item => store.put(item));
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async function resetDB(storeName) {
        const db = await openDB();
        const transaction = db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        store.clear();
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    function generateColor(idx) {
        const hue = (idx * 137.5) % 360;
        return `hsl(${hue}, 50%, 50%)`;
    }

    // Codrops onEndTransition utility
    function onEndTransition(el, callback) {
        const onEndCallbackFn = function(ev) {
            if (ev.target !== this) return;
            this.removeEventListener('transitionend', onEndCallbackFn);
            if (callback && typeof callback === 'function') { callback.call(this); }
        };
        if ('transition' in document.documentElement.style) {
            el.addEventListener('transitionend', onEndCallbackFn);
        } else {
            onEndCallbackFn.call(el);
        }
    }

    function MallMap(el, floorsParam) {
        this.DOM = { el };
        this.options = { perspective: 1000, spaceOpacityStep: 0.2, maxOpacity: 1, minOpacity: 0.3 };
        this.containerWidth = 150;
        this.containerHeight = 300;

        this.initData(floorsParam).then(() => {
            this.DOM.map = this.DOM.el.querySelector('.map');
            this.DOM.levels = this.DOM.map.querySelector('.map__levels');
            this.DOM.levelEls = Array.from(this.DOM.levels.querySelectorAll('.map__level'));
            this.levels = this.DOM.levelEls.length;
            this.currentLevel = -1;
            this.DOM.spaces = Array.from(this.DOM.levels.querySelectorAll('.map__space'));
            this.DOM.pins = Array.from(this.DOM.levels.querySelectorAll('.map__pin'));
            this.DOM.listItems = Array.from(this.DOM.el.querySelectorAll('.locations__item'));
            this.DOM.content = this.DOM.el.querySelector('.content');
            this.DOM.contentItems = Array.from(this.DOM.content.querySelectorAll('.content__item'));
            this.DOM.controls = this.DOM.el.querySelector('.controls');
            this.DOM.btnPrev = this.DOM.controls.querySelector('.controls__btn--prev');
            this.DOM.btnNext = this.DOM.controls.querySelector('.controls__btn--next');
            this.DOM.levelIndicator = this.DOM.controls.querySelector('.controls__level');
            this.DOM.resetFloors = this.DOM.controls.querySelector('.controls__btn--reset-floors');
            this.DOM.resetPins = this.DOM.controls.querySelector('.controls__btn--reset-pins');
            this._layout();
            this._initEvents();
        });
    }

    MallMap.prototype = {
        async initData(floorsParam) {
            const storedFloors = await loadFromDB("floors");
            const storedPins = await loadFromDB("pins");
            this.floors = storedFloors.length ? storedFloors : this.processFloors(floorsParam || defaultFloors);
            this.pins = storedPins.length ? storedPins : defaultPins;
            if (!storedFloors.length) {
                await saveToDB("floors", this.floors);
                await saveToDB("pins", this.pins);
            }
            this.generateSVG();
            this.generateContentPopups();
            this.DOM.levels.innerHTML = this.svgContent;
            this.DOM.content.innerHTML = this.contentContent;
        },

        processFloors(floors) {
            return floors.map((floor, idx) => {
                let refRoom = floor.rooms.find(r => !r.neighbours || r.neighbours.every(n => n.neighbouring.endsWith('IN')));
                if (!refRoom && floor.rooms.length === 1 && floor.rooms[0].neighbours?.[0]?.neighbouring.endsWith('IN')) {
                    alert(`Floor ${idx} with room ${floor.rooms[0].name} not generated properly due to unresolved inner neighbour`);
                    return null;
                }
                if (!refRoom) refRoom = floor.rooms[0];
                if (!refRoom.x && !refRoom.y) { refRoom.x = 0; refRoom.y = 0; }

                const processedRooms = new Map();
                processedRooms.set(refRoom.name, { ...refRoom, x: refRoom.x, y: refRoom.y });

                function calculateCoords(room, parent) {
                    if (processedRooms.has(room.name)) return;
                    const parentRoom = processedRooms.get(parent.neighbour);
                    if (!parentRoom) return;

                    let x = parentRoom.x, y = parentRoom.y;
                    const pw = parentRoom.width || 0, ph = parentRoom.height || 0;
                    const rw = room.width || 0, rh = room.height || 0;

                    switch (parent.neighbouring.toUpperCase()) {
                        case 'TOPLEFT': x -= rw; y -= rh; break;
                        case 'TOPRIGHT': x += pw; y -= rh; break;
                        case 'BOTTOMLEFT': x -= rw; y += ph; break;
                        case 'BOTTOMRIGHT': x += pw; y += ph; break;
                        case 'TOPLEFTIN': x += 1; y += 1; break;
                        case 'TOPRIGHTIN': x += pw - rw - 1; y += 1; break;
                        case 'BOTTOMLEFTIN': x += 1; y += ph - rh - 1; break;
                        case 'BOTTOMRIGHTIN': x += pw - rw - 1; y += ph - rh - 1; break;
                    }
                    processedRooms.set(room.name, { ...room, x, y });
                }

                floor.rooms.forEach(room => {
                    if (room.neighbours) room.neighbours.forEach(n => calculateCoords(room, n));
                });

                let minX = Math.min(...Array.from(processedRooms.values(), r => r.x));
                let minY = Math.min(...Array.from(processedRooms.values(), r => r.y));
                let maxX = Math.max(...Array.from(processedRooms.values(), r => r.x + (r.width || 0)));
                let maxY = Math.max(...Array.from(processedRooms.values(), r => r.y + (r.height || 0)));

                if (minX < 0 || minY < 0) {
                    Array.from(processedRooms.values()).forEach(r => {
                        r.x -= minX; r.y -= minY;
                    });
                    maxX -= minX; maxY -= minY;
                }

                if (maxX > this.containerWidth || maxY > this.containerHeight) {
                    const scaleX = this.containerWidth / maxX;
                    const scaleY = this.containerHeight / maxY;
                    const scale = Math.min(scaleX, scaleY);
                    Array.from(processedRooms.values()).forEach(r => {
                        r.x *= scale; r.y *= scale;
                        r.width = (r.width || 0) * scale;
                        r.height = (r.height || 0) * scale;
                    });
                }

                return { ...floor, rooms: Array.from(processedRooms.values()) };
            }).filter(f => f !== null);
        },

        generateSVG() {
            let svgContent = `
                <svg width="150" height="400" viewBox="0 0 150 300" style="background:#FDFDFD; z-index:9999;" xmlns="http://www.w3.org/2000/svg">
                    <g class="map__symbols">
                        <symbol id="icon-pin" width="8px" class="map__pin" viewBox="0 0 24 24">
                            <path d="M12,2a8,8,0,0,0-8,8c0,5.09,7,13,8,13s8-7.91,8-13A8,8,0,0,0,12,2Zm0,11a3,3,0,1,1,3-3A3,3,0,0,1,12,13Z"/>
                        </symbol>
                        <symbol id="icon-cross" class="icon icon--cross" viewBox="0 0 24 24">
                            <path d="M19,6.41,17.59,5,12,10.59,6.41,5,5,6.41,10.59,12,5,17.59,6.41,19,12,13.41,17.59,19,19,17.59,13.41,12Z"/>
                        </symbol>
                        <symbol id="icon-levels" class="icon icon--levels" viewBox="0 0 24 24">
                            <path d="M21,16H3V4H21M21,2H3A2,2 0 0,0 1,4V16A2,2 0 0,0 3,18H10V20H8V22H16V20H14V18H21A2,2 0 0,0 23,16Z"/>
                        </symbol>
                        <symbol id="icon-prev" class="icon icon--prev" viewBox="0 0 24 24">
                            <path d="M12 8V16L6 12L12 8Z"/>
                        </symbol>
                        <symbol id="icon-next" class="icon icon--next" viewBox="0 0 24 24">
                            <path d="M12 16V8L18 12L12 16Z"/>
                        </symbol>
                    </g>
            `;
            this.floors.forEach((floor, index) => {
                svgContent += `<g id="level${index}" class="map__level map__level--${index + 1}" data-level="${index}">`;
                floor.rooms.forEach((room, rIdx) => {
                    const color = generateColor(rIdx);
                    const points = [
                        [room.x, room.y], [room.x + room.width / 2, room.y], [room.x + room.width, room.y],
                        [room.x + room.width, room.y + room.height / 2], [room.x + room.width, room.y + room.height],
                        [room.x + room.width / 2, room.y + room.height], [room.x, room.y + room.height],
                        [room.x, room.y + room.height / 2]
                    ];
                    room.points = points;
                    svgContent += `
                        <polygon class="map__space" points="${points.map(p => p.join(',')).join(' ')}"
                            fill="${color}" stroke="${color}" stroke-width="0.2"
                            data-name="${room.name}" data-level="${index}" data-space="${index}-${rIdx}"/>
                    `;
                    points.forEach((p, pIdx) => {
                        svgContent += `<circle class="drag-point" cx="${p[0]}" cy="${p[1]}" r="2" data-space="${index}-${rIdx}" data-point="${pIdx}"/>`;
                    });
                    const pinsForRoom = this.pins.find(p => p[room.name])?.[room.name] || [];
                    pinsForRoom.forEach(pin => {
                        svgContent += `
                            <use class="map__pin icon icon--pin" href="#icon-pin" x="${room.x + pin.x}" y="${room.y + pin.y}"
                                data-space="${index}-${rIdx}" data-pin-x="${pin.x}" data-pin-y="${pin.y}"/>
                        `;
                    });
                });
                svgContent += '</g>';
            });
            svgContent += '</svg>';
            this.svgContent = svgContent;
        },

        generateContentPopups() {
            let contentContent = '';
            this.floors.forEach((floor, floorIdx) => {
                floor.rooms.forEach((room, roomIdx) => {
                    contentContent += `
                        <div class="content__item" id="content-${floorIdx}-${roomIdx}">
                            <h2 class="content__item-title">${room.name}</h2>
                            <p class="content__item-details">Details for ${room.name}</p>
                            <button class="content__button"><svg class="icon icon--cross"><use href="#icon-cross"></use></svg></button>
                        </div>
                    `;
                });
            });
            this.contentContent = contentContent;
        },

        _initEvents() {
            this.DOM.map.addEventListener('mousemove', (ev) => requestAnimationFrame(() => this._updateTransform(ev)));
            window.addEventListener('resize', () => requestAnimationFrame(() => this._updateSizes()));
            this.DOM.spaces.forEach(space => {
                let offsetX, offsetY;
                space.addEventListener('mousedown', (ev) => {
                    offsetX = ev.offsetX; offsetY = ev.offsetY;
                    space.style.cursor = 'move';
                });
                space.addEventListener('dragstart', (ev) => ev.preventDefault());
                document.addEventListener('mousemove', (ev) => {
                    if (offsetX === undefined) return;
                    const room = this.floors[space.dataset.level].rooms[space.dataset.space.split('-')[1]];
                    let newX = ev.clientX - offsetX - this.DOM.map.getBoundingClientRect().left;
                    let newY = ev.clientY - offsetY - this.DOM.map.getBoundingClientRect().top;
                    newX = Math.max(0, Math.min(newX, this.containerWidth - room.width));
                    newY = Math.max(0, Math.min(newY, this.containerHeight - room.height));
                    room.x = newX; room.y = newY;
                    room.points.forEach(p => { p[0] += newX - room.points[0][0]; p[1] += newY - room.points[0][1]; });
                    this.updateRoom(space, room);
                });
                document.addEventListener('mouseup', () => {
                    if (offsetX !== undefined) {
                        offsetX = undefined;
                        space.style.cursor = 'move';
                        this.saveFloors();
                    }
                });
                space.addEventListener('dblclick', (ev) => {
                    const room = this.floors[space.dataset.level].rooms[space.dataset.space.split('-')[1]];
                    const pinX = ev.offsetX - room.x, pinY = ev.offsetY - room.y;
                    let roomPins = this.pins.find(p => p[room.name]);
                    if (!roomPins) {
                        roomPins = { [room.name]: [] };
                        this.pins.push(roomPins);
                    }
                    roomPins[room.name].push({ x: pinX, y: pinY, type: "default", description: "" });
                    this.generateSVG();
                    this.DOM.levels.innerHTML = this.svgContent;
                    this.savePins();
                });
                space.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this.DOM.spaces.forEach(s => s.classList.remove('map__space--selected'));
                    space.classList.add('map__space--selected');
                    const data = this._getSpaceData(space);
                    const pin = this.DOM.pins.find(p => p.getAttribute('data-space') === space.getAttribute('data-space'));
                    if (pin) {
                        this.showPin(pin);
                        this.DOM.pins.forEach(p => { if (p !== pin) this.hidePin(p); });
                    }
                    this._openContent(data);
                });
            });
            this.DOM.levels.querySelectorAll('.drag-point').forEach(point => {
                let offsetX, offsetY;
                point.addEventListener('mousedown', (ev) => {
                    offsetX = ev.offsetX; offsetY = ev.offsetY;
                    ev.stopPropagation();
                });
                document.addEventListener('mousemove', (ev) => {
                    if (offsetX === undefined) return;
                    const space = this.DOM.spaces.find(s => s.dataset.space === point.dataset.space);
                    const room = this.floors[space.dataset.level].rooms[space.dataset.space.split('-')[1]];
                    const pIdx = parseInt(point.dataset.point);
                    const newX = ev.clientX - offsetX - this.DOM.map.getBoundingClientRect().left;
                    const newY = ev.clientY - offsetY - this.DOM.map.getBoundingClientRect().top;
                    room.points[pIdx] = [newX, newY];
                    this.updateRoom(space, room);
                });
                document.addEventListener('mouseup', () => {
                    if (offsetX !== undefined) {
                        offsetX = undefined;
                        this.saveFloors();
                    }
                });
            });
            this.DOM.btnPrev.addEventListener('click', () => {
                if (this.currentLevel > 0) this.showLevel(this.currentLevel - 1);
            });
            this.DOM.btnNext.addEventListener('click', () => {
                if (this.currentLevel < this.levels - 1) this.showLevel(this.currentLevel + 1);
                else if (this.currentLevel === -1) this.showLevel(0);
            });
            this.DOM.levelIndicator.addEventListener('click', () => this.showAllLevels());
            this.DOM.resetFloors.addEventListener('click', () => resetDB("floors").then(() => location.reload()));
            this.DOM.resetPins.addEventListener('click', () => resetDB("pins").then(() => location.reload()));
            this.DOM.contentItems.forEach(item => {
                item.querySelector('.content__button').addEventListener('click', () => this._closeContent());
            });
        },

        updateRoom(space, room) {
            space.setAttribute('points', room.points.map(p => p.join(',')).join(' '));
            this.DOM.levels.querySelectorAll(`.drag-point[data-space="${space.dataset.space}"]`).forEach((p, idx) => {
                p.setAttribute('cx', room.points[idx][0]);
                p.setAttribute('cy', room.points[idx][1]);
            });
        },

        async saveFloors() {
            await saveToDB("floors", this.floors);
            const event = new CustomEvent('floorStructureUpdated', { detail: this.floors });
            document.dispatchEvent(event);
        },

        async savePins() {
            await saveToDB("pins", this.pins);
            const event = new CustomEvent('pinsStructureUpdated', { detail: this.pins });
            document.dispatchEvent(event);
        },

        showPin(pin) {
            pin.classList.add('map__pin--active');
            onEndTransition(pin, () => {
                pin.style.transition = ''; // Reset transition after completion
            });
        },

        hidePin(pin) {
            pin.classList.remove('map__pin--active');
            onEndTransition(pin, () => {
                pin.style.transition = ''; // Reset transition after completion
            });
        },

        showLevel(level) {
            this.currentLevel = level;
            this.DOM.levelIndicator.innerHTML = `<svg class="icon icon--levels"><use href="#icon-levels"></use></svg> ${level + 1}`;
            this.DOM.levelEls.forEach((levelEl, idx) => {
                levelEl.style.opacity = idx === level ? this.options.maxOpacity : 0;
                levelEl.style.transform = `translateZ(${(idx - level) * 40}px)`;
                onEndTransition(levelEl, () => {
                    levelEl.style.transition = ''; // Reset transition after completion
                    if (idx !== level) levelEl.style.visibility = 'hidden'; // Hide non-active levels
                    else levelEl.style.visibility = 'visible';
                });
                levelEl.style.visibility = 'visible'; // Ensure visible during transition
            });
        },

        showAllLevels() {
            this.currentLevel = -1;
            this.DOM.levelIndicator.innerHTML = `<svg class="icon icon--levels"><use href="#icon-levels"></use></svg>`;
            this.DOM.levelEls.forEach((level, idx) => {
                const opacity = Math.max(this.options.maxOpacity - idx * this.options.spaceOpacityStep, this.options.minOpacity);
                level.style.opacity = opacity;
                level.style.transform = `translateZ(${idx * 40}px)`;
                onEndTransition(level, () => {
                    level.style.transition = ''; // Reset transition after completion
                    level.style.visibility = 'visible'; // Ensure all levels remain visible
                });
                level.style.visibility = 'visible'; // Ensure visible during transition
            });
        },

        _updateSizes() {
            const rect = this.DOM.map.getBoundingClientRect();
            this.sizes = { width: rect.width, height: rect.height };
            this.DOM.map.style.perspective = `${this.options.perspective}px`;
            this.DOM.map.style.perspectiveOrigin = '50% 50%';
        },

        _updateTransform(ev) {
            const mousepos = { x: ev.pageX, y: ev.pageY };
            const rect = this.DOM.map.getBoundingClientRect();
            const mapCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            const relmousepos = { x: mousepos.x - mapCenter.x, y: mousepos.y - mapCenter.y };
            const maxRotX = 60, maxRotY = 5;
            const rotX = (relmousepos.y / (rect.height / 2)) * maxRotX;
            const rotY = (relmousepos.x / (rect.width / 2)) * maxRotY;
            this.DOM.levels.style.transform = `rotateX(${maxRotX - rotX}deg) rotateY(${rotY}deg) translateZ(-10px)`;
        },

        _openContent(data) {
            if (this.isContentOpen) return;
            const contentItem = this.DOM.contentItems.find(item => item.id === `content-${data.space}`);
            if (contentItem) {
                contentItem.classList.add('content__item--current');
                onEndTransition(contentItem, () => {
                    contentItem.style.transition = ''; // Reset transition after completion
                    this.isContentOpen = true;
                });
            }
        },

        _closeContent() {
            if (!this.isContentOpen) return;
            const currentContent = this.DOM.content.querySelector('.content__item--current');
            if (currentContent) {
                currentContent.classList.remove('content__item--current');
                onEndTransition(currentContent, () => {
                    currentContent.style.transition = ''; // Reset transition after completion
                    this.isContentOpen = false;
                });
            }
        },

        _layout() {
            this.DOM.levels.style.transform = `rotateX(60deg) rotateZ(-45deg) translateZ(-10px)`;
            this._updateSizes();
            this.showAllLevels();
            this.DOM.pins.forEach(pin => this.hidePin(pin));
        },

        _getSpaceData(space) {
            return {
                level: parseInt(space.getAttribute('data-level'), 10),
                space: space.getAttribute('data-space')
            };
        }
    };

    // DOM Setup
    const container = document.createElement('div');
    container.className = 'container';
    container.innerHTML = `
        <div class="map"><div class="map__levels" id="map-levels"></div></div>
        <div class="sidebar">
            <div class="controls">
                <button class="controls__btn controls__btn--prev"><svg class="icon icon--prev"><use href="#icon-prev"></use></svg></button>
                <span class="controls__level"></span>
                <button class="controls__btn controls__btn--next"><svg class="icon icon--next"><use href="#icon-next"></use></svg></button>
                <button class="controls__btn controls__btn--reset-floors">Reset Floors</button>
                <button class="controls__btn controls__btn--reset-pins">Reset Pins</button>
            </div>
            <div class="locations" id="locations"><ul class="locations__list"></ul></div>
        </div>
        <div class="content" id="content"></div>
    `;
    document.documentElement.insertBefore(container, document.body);

    // Initialize MallMap
    const mallMap = new MallMap(container, defaultFloors);
})();
