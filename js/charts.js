/**
 * PandaWind MktPro Canvas Chart Engine (Enhanced Interactive Version)
 * Lightweight, zero-dependency, high-DPI canvas charts with interactive crosshair & tooltips
 * 
 * FIX: Canvas is sized ONCE per renderLineChart call. The draw() closure reuses
 *      cached dimensions so mousemove never triggers a resize feedback loop.
 */

const PandaWindCharts = {
    charts: {},

    /**
     * Size the canvas buffer to match its CSS layout size × devicePixelRatio.
     * MUST only be called once per render, never inside a mousemove handler.
     */
    setupCanvas(canvas) {
        if (!canvas) return null;
        const dpr = window.devicePixelRatio || 1;
        // getBoundingClientRect reflects CSS width/height (pinned by CSS rule)
        const rect = canvas.getBoundingClientRect();
        const cssW = rect.width;
        const cssH = rect.height;

        // Only resize the buffer when needed (avoids flicker and loop)
        const needsResize =
            canvas.width !== Math.round(cssW * dpr) ||
            canvas.height !== Math.round(cssH * dpr);
        if (needsResize) {
            canvas.width = Math.round(cssW * dpr);
            canvas.height = Math.round(cssH * dpr);
        }

        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // reset + apply scale
        return { ctx, width: cssW, height: cssH };
    },

    // Render Multi-Line / Area Chart with Interactive Hover Tooltip
    renderLineChart(canvasId, config) {
        const { labels, datasets, yAxisFormatter, tooltipFormatter, baselineY } = config;
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        this.charts[canvasId] = config;

        // --- Size once at init ---
        const initSetup = this.setupCanvas(canvas);
        if (!initSetup) return;
        const cachedWidth = initSetup.width;
        const cachedHeight = initSetup.height;

        const draw = (hoverIdx = -1) => {
            // Reuse cached dimensions; just grab the context again
            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const width = cachedWidth;
            const height = cachedHeight;

            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
            const textColor = isDark ? '#94a3b8' : '#64748b';

            const padding = { top: 35, right: 30, bottom: 40, left: 65 };
            const chartW = width - padding.left - padding.right;
            const chartH = height - padding.top - padding.bottom;

            // Find min & max
            let maxVal = -Infinity;
            let minVal = Infinity;
            datasets.forEach(ds => {
                ds.data.forEach(v => {
                    if (v > maxVal) maxVal = v;
                    if (v < minVal) minVal = v;
                });
            });
            if (minVal > 0) minVal = 0;
            maxVal = maxVal * 1.15;
            if (maxVal === 0) maxVal = 100;

            // Clear
            ctx.clearRect(0, 0, width, height);

            // Draw Y-Axis & Gridlines
            const yTicks = 5;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.font = '11px -apple-system, sans-serif';
            ctx.fillStyle = textColor;

            for (let i = 0; i <= yTicks; i++) {
                const val = minVal + (maxVal - minVal) * (i / yTicks);
                const y = padding.top + chartH - (i / yTicks) * chartH;

                ctx.strokeStyle = gridColor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();

                const formatted = yAxisFormatter ? yAxisFormatter(val) : Math.round(val);
                ctx.fillText(formatted, padding.left - 10, y);
            }

            // Optional Baseline (e.g. 100% ROAS target line)
            if (typeof baselineY === 'number' && baselineY >= minVal && baselineY <= maxVal) {
                const by = padding.top + chartH - ((baselineY - minVal) / (maxVal - minVal)) * chartH;
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(padding.left, by);
                ctx.lineTo(width - padding.right, by);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = '#ef4444';
                ctx.fillText('Target 100%', width - padding.right, by - 8);
            }

            // Draw X-Axis Labels
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = textColor;
            const stepX = chartW / Math.max(1, labels.length - 1);
            const interval = Math.ceil(labels.length / 12);

            labels.forEach((lbl, idx) => {
                if (idx % interval === 0 || idx === labels.length - 1) {
                    const x = padding.left + idx * stepX;
                    ctx.fillText(lbl, x, height - padding.bottom + 10);
                }
            });

            // Draw Datasets
            datasets.forEach(ds => {
                const pts = ds.data.map((val, idx) => ({
                    x: padding.left + idx * stepX,
                    y: padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH,
                    val: val
                }));

                // Area Gradient
                if (ds.fill && pts.length > 0) {
                    const grad = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
                    grad.addColorStop(0, ds.fillColor || 'rgba(59, 130, 246, 0.2)');
                    grad.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, height - padding.bottom);
                    pts.forEach(p => ctx.lineTo(p.x, p.y));
                    ctx.lineTo(pts[pts.length - 1].x, height - padding.bottom);
                    ctx.closePath();
                    ctx.fillStyle = grad;
                    ctx.fill();
                }

                // Line
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                pts.forEach(p => ctx.lineTo(p.x, p.y));
                ctx.strokeStyle = ds.borderColor || '#3b82f6';
                ctx.lineWidth = ds.borderWidth || 2.5;
                ctx.lineJoin = 'round';
                ctx.stroke();

                // Dots
                pts.forEach((p, idx) => {
                    const isHovered = (idx === hoverIdx);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, isHovered ? 6 : 3.5, 0, Math.PI * 2);
                    ctx.fillStyle = isHovered ? '#ffffff' : (ds.borderColor || '#3b82f6');
                    ctx.fill();
                    ctx.strokeStyle = ds.borderColor || '#3b82f6';
                    ctx.lineWidth = isHovered ? 3 : 1.5;
                    ctx.stroke();
                });
            });

            // Draw Crosshair and Tooltip if Hovered
            if (hoverIdx >= 0 && hoverIdx < labels.length) {
                const hx = padding.left + hoverIdx * stepX;

                // Vertical Crosshair
                ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(hx, padding.top);
                ctx.lineTo(hx, height - padding.bottom);
                ctx.stroke();
                ctx.setLineDash([]);

                // Tooltip Box
                const tooltipTitle = labels[hoverIdx];
                const lines = [tooltipTitle];
                datasets.forEach(ds => {
                    const val = ds.data[hoverIdx];
                    const valStr = ds.tooltipValueFormatter ? ds.tooltipValueFormatter(val) : (yAxisFormatter ? yAxisFormatter(val) : val);
                    lines.push((ds.label || '') + ': ' + valStr);
                });

                ctx.font = '12px -apple-system, sans-serif';
                let boxW = 160;
                lines.forEach(l => {
                    const tw = ctx.measureText(l).width + 24;
                    if (tw > boxW) boxW = tw;
                });
                const boxH = lines.length * 20 + 12;

                let boxX = hx + 12;
                if (boxX + boxW > width - padding.right) {
                    boxX = hx - boxW - 12;
                }
                const boxY = padding.top + 10;

                // Box Background
                ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
                ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
                ctx.lineWidth = 1;
                ctx.shadowColor = 'rgba(0,0,0,0.3)';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.roundRect(boxX, boxY, boxW, boxH, 6);
                ctx.fill();
                ctx.stroke();
                ctx.shadowBlur = 0;

                // Box Content
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
                ctx.font = 'bold 11.5px sans-serif';
                ctx.fillText(lines[0], boxX + 12, boxY + 8);

                ctx.font = '11px sans-serif';
                lines.slice(1).forEach((line, lIdx) => {
                    const ds = datasets[lIdx];
                    ctx.fillStyle = ds.borderColor || '#3b82f6';
                    ctx.fillRect(boxX + 12, boxY + 28 + lIdx * 19, 8, 8);
                    ctx.fillStyle = isDark ? '#cbd5e1' : '#334155';
                    ctx.fillText(line, boxX + 26, boxY + 26 + lIdx * 19);
                });
            }

            // Legend at Top
            let legendX = width - padding.right - (datasets.length * 120);
            if (legendX < padding.left) legendX = padding.left;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            datasets.forEach(ds => {
                ctx.fillStyle = ds.borderColor || '#3b82f6';
                ctx.fillRect(legendX, 12, 10, 10);
                ctx.fillStyle = textColor;
                ctx.font = '11px sans-serif';
                ctx.fillText(ds.label, legendX + 15, 17);
                legendX += 130;
            });
        };

        // Attach Mouse Events for Hover Tooltip (once per canvas element)
        if (!canvas._hasHoverEvent) {
            canvas._hasHoverEvent = true;

            canvas.addEventListener('mousemove', (e) => {
                // Use CSS layout size (not canvas.width which is the buffer)
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const padL = 65, padR = 30;
                const cw = rect.width - padL - padR;
                const cfg = this.charts[canvasId];
                if (!cfg || !cfg.labels) return;
                const sx = cw / Math.max(1, cfg.labels.length - 1);
                const relX = mouseX - padL;
                const hoverIdx = Math.round(relX / sx);
                if (hoverIdx >= 0 && hoverIdx < cfg.labels.length) {
                    draw(hoverIdx);
                }
            });

            canvas.addEventListener('mouseleave', () => {
                draw(-1);
            });
        }

        draw(-1);
    },

    // Render Bar Chart
    renderBarChart(canvasId, config) {
        const { labels, datasets, yAxisFormatter } = config;
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const setup = this.setupCanvas(canvas);
        if (!setup) return;
        const { ctx, width, height } = setup;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
        const textColor = isDark ? '#94a3b8' : '#64748b';

        const padding = { top: 30, right: 20, bottom: 40, left: 60 };
        const chartW = width - padding.left - padding.right;
        const chartH = height - padding.top - padding.bottom;

        let maxVal = -Infinity;
        datasets.forEach(ds => {
            ds.data.forEach(v => { if (v > maxVal) maxVal = v; });
        });
        maxVal = maxVal * 1.15;
        if (maxVal <= 0) maxVal = 100;

        ctx.clearRect(0, 0, width, height);

        // Y-Axis
        const yTicks = 4;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.fillStyle = textColor;

        for (let i = 0; i <= yTicks; i++) {
            const val = (maxVal / yTicks) * i;
            const y = padding.top + chartH - (i / yTicks) * chartH;

            ctx.strokeStyle = gridColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();

            const formatted = yAxisFormatter ? yAxisFormatter(val) : Math.round(val);
            ctx.fillText(formatted, padding.left - 10, y);
        }

        // Bars
        const groupW = chartW / labels.length;
        const barPad = 6;
        const barW = (groupW - barPad * 2) / datasets.length;

        labels.forEach((lbl, gIdx) => {
            const gx = padding.left + gIdx * groupW;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = textColor;
            ctx.fillText(lbl, gx + groupW / 2, height - padding.bottom + 8);

            datasets.forEach((ds, dIdx) => {
                const val = ds.data[gIdx] || 0;
                const barH = (val / maxVal) * chartH;
                const bx = gx + barPad + dIdx * barW;
                const by = padding.top + chartH - barH;

                ctx.fillStyle = ds.backgroundColor || '#3b82f6';
                ctx.beginPath();
                ctx.roundRect(bx, by, barW - 2, barH, [4, 4, 0, 0]);
                ctx.fill();
            });
        });
    },

    // Render Donut Chart
    renderDonutChart(canvasId, config) {
        const { labels, data, colors, centerText } = config;
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const setup = this.setupCanvas(canvas);
        if (!setup) return;
        const { ctx, width, height } = setup;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#f8fafc' : '#0f172a';
        const subColor = isDark ? '#94a3b8' : '#64748b';

        ctx.clearRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(cx, cy) - 20;
        const innerRadius = radius * 0.65;

        const total = data.reduce((a, b) => a + b, 0);
        let startAngle = -Math.PI / 2;

        data.forEach((val, idx) => {
            const sliceAngle = (val / total) * Math.PI * 2;
            const endAngle = startAngle + sliceAngle;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, endAngle);
            ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = colors[idx % colors.length];
            ctx.fill();
            ctx.strokeStyle = isDark ? '#111827' : '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            startAngle = endAngle;
        });

        if (centerText) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = textColor;
            ctx.font = 'bold 17px sans-serif';
            ctx.fillText(centerText.value || '', cx, cy - 6);
            ctx.fillStyle = subColor;
            ctx.font = '11px sans-serif';
            ctx.fillText(centerText.label || '', cx, cy + 14);
        }
    }
};

window.PandaWindCharts = PandaWindCharts;
