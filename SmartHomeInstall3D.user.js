// ==UserScript==
// @name         Interactive 3D Multi-Level Floorplan
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Injects an interactive 3D multi-level floorplan with room highlighting and content popups
// @author       ZLudany
// @match        https://myactivity.google.com/product/assistant*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    // Styles as a string (unchanged from previous step)
    const styles = `
        /* General */
        *,
        *::after,
        *::before {
            -webkit-box-sizing: border-box;
            box-sizing: border-box;
        }

        a {
            text-decoration: none;
            color: #aaa;
            outline: none;
        }

        a:hover,
        a:focus {
            color: #515158;
            outline: none;
        }

        /* Container */
        .container {
            width: 150px;
            height: 415px; /* 400px SVG + 15 Wpx locations */
            display: flex;
            flex-direction: column;
            position: fixed;
            top: 130px;
            right: 40px;
            background: #222;
            z-index: 9999;
        }

        /* Map */
        .map {
            width: 100%;
            height: 400px;
            position: relative;
            -webkit-perspective: 1000px;
            perspective: 1000px;
            -webkit-perspective-origin: 50% 50%;
            perspective-origin: 50% 50%;
        }

        .map__levels {
            width: 150px;
            height: 400px;
            position: absolute;
            top: 50%;
            left: 50%;
            margin: -200px 0 0 -75px;
            -webkit-transition: -webkit-transform 0.3s;
            transition: transform 0.3s;
            -webkit-transform-style: preserve-3d;
            transform-style: preserve-3d;
        }

        .map__space {
            cursor: pointer;
            -webkit-transition: fill-opacity 0.8s;
            transition: fill-opacity 0.8s;
            fill: #bdbdbd;
            fill-opacity: 0.6;
        }

        .map__space:hover {
            fill-opacity: 0.8;
        }

        .map__space--selected {
            fill: #A4A4A4;
            fill-opacity: 1;
        }

        .map__pin {
            width: 8px;
            height: 8px;
            -webkit-transform-style: preserve-3d;
            transform-style: preserve-3d;
            opacity: 0;
            -webkit-transform: translate3d(0, -20px, 0);
            transform: translate3d(0, -20px, 0);
            -webkit-transition: opacity 0.3s, -webkit-transform 0.3s;
            transition: opacity 0.3s, transform 0.3s;
            -webkit-transition-timing-function: cubic-bezier(0.2, 1, 0.3, 1);
            transition-timing-function: cubic-bezier(0.2, 1, 0.3, 1);
        }

        .map__pin--active {
            opacity: 1;
            -webkit-transform: translate3d(0, 0, 0);
            transform: translate3d(0, 0, 0);
        }

        .map__pin:nth-child(2) {
            -webkit-transition-delay: 0.05s;
            transition-delay: 0.05s;
        }
        .map__pin:nth-child(3) {
            -webkit-transition-delay: 0.1s;
            transition-delay: 0.1s;
        }
        .map__pin:nth-child(4) {
            -webkit-transition-delay: 0.15s;
            transition-delay: 0.15s;
        }
        .map__pin:nth-child(5) {
            -webkit-transition-delay: 0.2s;
            transition-delay: 0.2s;
        }
        .map__pin:nth-child(6) {
            -webkit-transition-delay: 0.25s;
            transition-delay: 0.25s;
        }
        .map__pin:nth-child(7) {
            -webkit-transition-delay: 0.3s;
            transition-delay: 0.3s;
        }

        .map__level {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            cursor: pointer;
            pointer-events: auto;
            -webkit-transition: opacity 1s, -webkit-transform 1s;
            transition: opacity 1s, transform 1s;
            -webkit-transition-timing-function: cubic-bezier(0.7, 0, 0.3, 1);
            transition-timing-function: cubic-bezier(0.7, 0, 0.3, 1);
            -webkit-transform-style: preserve-3d;
            transform-style: preserve-3d;
        }

        .map__level::after {
            font-size: 8px;
            line-height: 0;
            position: absolute;
            z-index: 100;
            top: -10px;
            left: 20px;
            white-space: nowrap;
            color: #7d7d86;
            -webkit-transform: rotateZ(45deg) rotateX(-60deg) translateZ(5px);
            transform: rotateZ(45deg) rotateX(-60deg) translateZ(5px);
            -webkit-transition: -webkit-transform 1s, color 0.3s;
            transition: transform 1s, color 0.3s;
            -webkit-transition-timing-function: cubic-bezier(0.7, 0, 0.3, 1);
            transition-timing-function: cubic-bezier(0.7, 0, 0.3, 1);
        }

        .map__level:hover::after {
            color: #515158;
        }

        .map__level--1::after {
            content: 'L1';
        }

        .map__level--2::after {
            content: 'L2';
        }

        .map__level--3::after {
            content: 'L3';
        }

        .map__level--1 {
            -webkit-transform: translateZ(0px);
            transform: translateZ(0px);
        }

        .map__level--2 {
            -webkit-transform: translateZ(10px);
            transform: translateZ(10px);
        }

        .map__level--3 {
            -webkit-transform: translateZ(20px);
            transform: translateZ(20px);
        }

        /* Controls */
        .controls {
            width: 100%;
            height: 15px;
            display: flex;
            flex-direction: column;
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

        .locations__link:hover {
            color: #515158;
        }

        .locations__name {
            margin: 0;
            font-size: 6px;
        }

        .locations__floor {
            margin: 0;
            font-size: 5px;
            color: #999;
        }

        /* Content Popup */
        .content {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
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
            -webkit-transform: translate3d(0, 50px, 0);
            transform: translate3d(0, 50px, 0);
            -webkit-transition: opacity 0.3s, -webkit-transform 0.3s;
            transition: opacity 0.3s, transform 0.3s;
            pointer-events: none;
        }

        .content__item--current {
            opacity: 1;
            -webkit-transform: translate3d(0, 0, 0);
            transform: translate3d(0, 0, 0);
            pointer-events: auto;
        }

        .content__item-title {
            font-size: 1em;
            margin: 0 0 0.5em;
        }

        .content__item-details {
            font-size: 0.75em;
        }

        .content__button {
            position: absolute;
            top: 1em;
            right: 1em;
            background: none;
            border: none;
            color: #fff;
            font-size: 1em;
            cursor: pointer;
        }

        /* Icons */
        .icon {
            display: block;
            width: 1em;
            height: 1em;
            margin: 0 auto;
            fill: currentColor;
        }

        .icon--pin {
            width: 100%;
            height: 100%;
        }
    `;

    // Inject styles into the page
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);

    // Floorplan data (extended with content for popups)
    const floors = [
        {
            name: 'Ground Floor',
            z: 0,
            rooms: [
                { name: 'Entryway', x: 0, y: 3, width: 6, depth: 2, color: 0xdeb887, innerColor: 0xe6d5a8, details: 'The main entrance to the building.' },
                { name: 'Passage', x: 0, y: 7, width: 2, depth: 1, color: 0xa9a9a9, innerColor: 0xbababa, details: 'A narrow hallway connecting rooms.' },
                { name: 'Master Bedroom', x: 0, y: 11, width: 6, depth: 4, color: 0x808080, innerColor: 0x999999, details: 'A spacious bedroom with a view.' }
            ]
        },
        {
            name: 'First Floor',
            z: 1,
            rooms: [
                { name: 'Living Room', x: 0, y: 3, width: 6, depth: 4, color: 0x4682b4, innerColor: 0x6a9bd3, details: 'A cozy space for relaxation.' },
                { name: 'Wellness Room', x: 0, y: 7, width: 4, depth: 3, color: 0xffcccc, innerColor: 0xffe6e6, details: 'A room for meditation and wellness.' }
            ]
        },
        {
            name: 'Second Floor',
            z: 2,
            rooms: [
                { name: 'Guest Room', x: 0, y: 3, width: 6, depth: 4, color: 0x90ee90, innerColor: 0xaaffaa, details: 'A comfortable room for guests.' },
                { name: 'Office', x: 0, y: 7, width: 4, depth: 2, color: 0xdda0dd, innerColor: 0xe6b8e6, details: 'A quiet space for work and study.' }
            ]
        }
    ];

    // Function to convert hex color to SVG-compatible string
    function hexToColorString(hex) {
        return `#${hex.toString(16).padStart(6, '0')}`;
    }

    // Function to generate SVG dynamically with 3D layering
    function generateSVG(floors) {
        let svgContent = `
            <svg width="150" height="400" viewBox="0 0 20 20" style="background: white;" xmlns="http://www.w3.org/2000/svg">
                <g class="map__symbols">
                    <symbol id="icon-pin" viewBox="0 0 24 24">
                        <path d="M12,2a8,8,0,0,0-8,8c0,5.09,7,13,8,13s8-7.91,8-13A8,8,0,0,0,12,2Zm0,11a3,3,0,1,1,3-3A3,3,0,0,1,12,13Z"/>
                    </symbol>
                    <symbol id="icon-cross" viewBox="0 0 24 24">
                        <path d="M19,6.41,17.59,5,12,10.59,6.41,5,5,6.41,10.59,12,5,17.59,6.41,19,12,13.41,17.59,19,19,17.59,13.41,12Z"/>
                    </symbol>
                </g>
        `;

        floors.forEach((floor, index) => {
            svgContent += `<g id="level${index}" class="map__level map__level--${index + 1}" data-level="${index}">`;
            floor.rooms.forEach((room, roomIndex) => {
                const fillColor = hexToColorString(room.innerColor);
                const strokeColor = hexToColorString(room.color);
                svgContent += `
                    <rect id="space${index}-${roomIndex}" class="map__space" x="${room.x}" y="${room.y}" width="${room.width}" height="${room.depth}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="0.1" data-name="${room.name}" data-level="${index}" data-space="${index}-${roomIndex}" />
                    <use class="map__pin icon icon--pin" href="#icon-pin" x="${room.x + room.width / 2}" y="${room.y + room.depth / 2}" data-space="space${index}-${roomIndex}" />
                `;
            });
            svgContent += '</g>';
        });

        svgContent += '</svg>';
        return svgContent;
    }

    // Generate location list
    function generateLocationList(floors) {
        let locationsContent = '';
        floors.forEach((floor, floorIndex) => {
            floor.rooms.forEach((room, roomIndex) => {
                locationsContent += `
                    <li class="locations__item" data-level="${floorIndex}" data-space="${floorIndex}-${roomIndex}">
                        <a href="#" class="locations__link">
                            <h2 class="locations__name">${room.name}</h2>
                            <p class="locations__floor">${floor.name}</p>
                        </a>
                    </li>
                `;
            });
        });
        return locationsContent;
    }

    // Generate content popups
    function generateContentPopups(floors) {
        let contentContent = '';
        floors.forEach((floor, floorIndex) => {
            floor.rooms.forEach((room, roomIndex) => {
                contentContent += `
                    <div class="content__item" id="content-${floorIndex}-${roomIndex}">
                        <h2 class="content__item-title">${room.name}</h2>
                        <p class="content__item-details">${room.details}</p>
                        <button class="content__button">Close</button>
                    </div>
                `;
            });
        });
        return contentContent;
    }

    // Create HTML structure dynamically
    const container = document.createElement('div');
    container.className = 'container';

    const map = document.createElement('div');
    map.className = 'map';

    const mapLevels = document.createElement('div');
    mapLevels.className = 'map__levels';
    mapLevels.id = 'map-levels';
    mapLevels.innerHTML = generateSVG(floors);
    map.appendChild(mapLevels);

    const controls = document.createElement('div');
    controls.className = 'controls';

    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';

    const locations = document.createElement('div');
    locations.className = 'locations';
    locations.id = 'locations';
    const locationsList = document.createElement('ul');
    locationsList.className = 'locations__list';
    locationsList.innerHTML = generateLocationList(floors);
    locations.appendChild(locationsList);
    sidebar.appendChild(locations);

    controls.appendChild(sidebar);

    const content = document.createElement('div');
    content.className = 'content';
    content.id = 'content';
    content.innerHTML = generateContentPopups(floors);

    container.appendChild(map);
    container.appendChild(controls);
    container.appendChild(content);

    document.body.appendChild(container);

    // Utility functions from main.js
    function extend(a, b) {
        for (var key in b) {
            if (b.hasOwnProperty(key)) {
                a[key] = b[key];
            }
        }
        return a;
    }

    function getMousePos(e) {
        var posx = 0, posy = 0;
        if (!e) e = window.event;
        if (e.pageX || e.pageY) {
            posx = e.pageX;
            posy = e.pageY;
        } else if (e.clientX || e.clientY) {
            posx = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
            posy = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
        }
        return { x: posx, y: posy };
    }

    // MallMap constructor
    function MallMap(el, options) {
        this.DOM = {};
        this.DOM.el = el;
        this.options = extend({
            perspective: 1000,
            spaceOpacityStep: 0.2,
            maxOpacity: 1,
            minOpacity: 0.3
        }, options || {});

        this.DOM.map = this.DOM.el.querySelector('.map');
        this.DOM.levels = this.DOM.map.querySelector('.map__levels');
        this.DOM.levelEls = Array.from(this.DOM.levels.querySelectorAll('.map__level'));
        this.levels = this.DOM.levelEls.length;
        this.currentLevel = 0; // Default level (not used for switching)
        this.DOM.spaces = Array.from(this.DOM.levels.querySelectorAll('.map__space'));
        this.DOM.pins = Array.from(this.DOM.levels.querySelectorAll('.map__pin'));
        this.DOM.listItems = Array.from(this.DOM.el.querySelectorAll('.locations__item'));
        this.DOM.content = this.DOM.el.querySelector('.content');
        this.DOM.contentItems = Array.from(this.DOM.content.querySelectorAll('.content__item'));

        this._layout();
        this._initEvents();
    }

    MallMap.prototype = {
        _initEvents: function() {
            // Mouse move for 3D tilt effect
            this.mousemoveFn = (ev) => {
                requestAnimationFrame(() => {
                    this._updateTransform(ev);
                });
            };
            this.DOM.map.addEventListener('mousemove', this.mousemoveFn);

            // Window resize
            this.resizeFn = () => {
                requestAnimationFrame(() => {
                    this._updateSizes();
                });
            };
            window.addEventListener('resize', this.resizeFn);

            // Space clicks
            this.DOM.spaces.forEach(space => {
                space.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this.DOM.spaces.forEach(s => s.classList.remove('map__space--selected'));
                    space.classList.add('map__space--selected');
                    this._openContent(this._getSpaceData(space));
                });
            });

            // Sidebar list item clicks
            this.DOM.listItems.forEach(item => {
                item.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    const data = this._getSpaceData(item);
                    const space = this.DOM.spaces.find(s => s.getAttribute('data-space') === data.space);
                    if (space) {
                        this.DOM.spaces.forEach(s => s.classList.remove('map__space--selected'));
                        space.classList.add('map__space--selected');
                        this._openContent(data);
                    }
                });
            });

            // Content close buttons
            this.DOM.contentItems.forEach(item => {
                const closeBtn = item.querySelector('.content__button');
                closeBtn.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this._closeContent();
                });
            });
        },

        _updateLevel: function() {
            // Simplified since floor switching is disabled
            this._updateOpacityLevels();
        },

        _updateOpacityLevels: function() {
            this.DOM.levelEls.forEach((level, idx) => {
                const levelDiff = idx; // No currentLevel focus, so use index for gradient
                const opacity = Math.max(this.options.maxOpacity - levelDiff * this.options.spaceOpacityStep, this.options.minOpacity);
                level.style.opacity = opacity;
            });
        },

        _updateSizes: function() {
            const rect = this.DOM.map.getBoundingClientRect();
            this.sizes = {
                width: rect.width,
                height: rect.height
            };
            this.DOM.map.style.perspective = `${this.options.perspective}px`;
            this.DOM.map.style.perspectiveOrigin = '50% 50%';
        },

        _updateTransform: function(ev) {
            const mousepos = getMousePos(ev);
            const docScrolls = {
                left: document.body.scrollLeft + document.documentElement.scrollLeft,
                top: document.body.scrollTop + document.documentElement.scrollTop
            };
            const rect = this.DOM.map.getBoundingClientRect();
            const mapCenter = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
            const relmousepos = {
                x: mousepos.x - mapCenter.x + docScrolls.left,
                y: mousepos.y - mapCenter.y + docScrolls.top
            };
            const maxRotX = 60; // Reduced for smaller map
            const maxRotY = 5;  // Reduced for smaller map
            const rotX = (relmousepos.y / (rect.height / 2)) * maxRotX;
            const rotY = (relmousepos.x / (rect.width / 2)) * maxRotY;
            this.DOM.levels.style.transform = `rotateX(${maxRotX - rotX}deg) rotateY(${rotY}deg) translateZ(-10px)`;
        },

        _openContent: function(data) {
            if (this.isContentOpen) {
                return;
            }
            const contentItem = this.DOM.contentItems.find(item => item.id === `content-${data.space}`);
            if (contentItem) {
                contentItem.classList.add('content__item--current');
                this.isContentOpen = true;
            }
        },

        _closeContent: function() {
            if (!this.isContentOpen) {
                return;
            }
            const currentContent = this.DOM.content.querySelector('.content__item--current');
            if (currentContent) {
                currentContent.classList.remove('content__item--current');
                this.isContentOpen = false;
            }
        },

        _layout: function() {
            // Initialize CSS transformations
            this.DOM.levels.style.transform = `rotateX(60deg) rotateZ(-45deg) translateZ(-10px)`;
            this.DOM.levelEls.forEach((level, idx) => {
                level.style.transform = `translateZ(${idx * 10}px)`;
            });

            // Set initial sizes and opacities
            this._updateSizes();
            this._updateOpacityLevels();

            // Animate pins
            this.DOM.pins.forEach(pin => pin.classList.add('map__pin--active'));
        },

        _getSpaceData: function(space) {
            return {
                level: parseInt(space.getAttribute('data-level'), 10),
                space: space.getAttribute('data-space')
            };
        }
    };
    // Initialize the map
    (function() {
        const mapEl = document.querySelector('.container');
        const mallMap = new MallMap(mapEl, {
            perspective: 1000,
            spaceOpacityStep: 0.2,
            maxOpacity: 1,
            minOpacity: 0.3
        });
    })();
})();
