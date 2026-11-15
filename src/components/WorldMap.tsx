import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import type { Attraction, Listing } from '../types';
import { formatINR } from '../utils/currency';

export interface MapPoint {
  name: string;
  lat: number;
  lng: number;
  country?: string;
}

interface WorldMapProps {
  origin?: MapPoint | null;
  destination: MapPoint;
  attractions?: Attraction[];
  listings?: Listing[];
  heightClass?: string;
}

function haversineKm(a: MapPoint, b: MapPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

function createPinIcon(color: string, label: string) {
  return L.divIcon({
    className: 'voyage-map-pin',
    html: `<div style="display:flex;align-items:center;gap:6px;transform:translate(-50%,-100%);white-space:nowrap;">
      <span style="width:12px;height:12px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 2px 6px rgba(15,23,42,0.35);display:inline-block;"></span>
      <span style="background:#0f172a;color:#ffffff;font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px;box-shadow:0 2px 6px rgba(15,23,42,0.2);">${label}</span>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function createSmallDotIcon(color: string) {
  return L.divIcon({
    className: 'voyage-map-dot',
    html: `<div style="width:11px;height:11px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(15,23,42,0.35);transform:translate(-50%,-50%);"></div>`,
    iconSize: [11, 11],
    iconAnchor: [5, 5],
  });
}

export function WorldMap({
  origin,
  destination,
  attractions = [],
  listings = [],
  heightClass = 'h-[400px]',
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const routeMetrics = useMemo(() => {
    if (!origin) return null;
    const km = haversineKm(origin, destination);
    const estHours = Math.max(0.5, Number((km / 780).toFixed(1)));
    return { km, estHours };
  }, [origin, destination]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [destination.lat, destination.lng],
      zoom: 11,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const boundsPoints: L.LatLngExpression[] = [[destination.lat, destination.lng]];

    const destMarker = L.marker([destination.lat, destination.lng], {
      icon: createPinIcon('#1d4ed8', destination.name),
    }).bindPopup(
      `<div style="font-size:13px;">
        <div style="font-weight:700;color:#0f172a;">${destination.name}</div>
        <div style="color:#475569;font-size:12px;">${destination.country || 'Selected Destination'}</div>
      </div>`
    );
    destMarker.addTo(group);

    if (origin && (Math.abs(origin.lat - destination.lat) > 0.05 || Math.abs(origin.lng - destination.lng) > 0.05)) {
      boundsPoints.push([origin.lat, origin.lng]);

      const originMarker = L.marker([origin.lat, origin.lng], {
        icon: createPinIcon('#0f172a', `Start: ${origin.name}`),
      }).bindPopup(
        `<div style="font-size:13px;">
          <div style="font-weight:700;color:#0f172a;">Starting Point: ${origin.name}</div>
          <div style="color:#475569;font-size:12px;">${origin.country || ''}</div>
        </div>`
      );
      originMarker.addTo(group);

      L.polyline(
        [
          [origin.lat, origin.lng],
          [destination.lat, destination.lng],
        ],
        {
          color: '#1d4ed8',
          weight: 2.5,
          dashArray: '6 6',
          opacity: 0.85,
        }
      ).addTo(group);
    }

    for (const attr of attractions) {
      boundsPoints.push([attr.lat, attr.lng]);
      const color = attr.category === 'indoor' ? '#0f766e' : '#b45309';
      L.marker([attr.lat, attr.lng], {
        icon: createSmallDotIcon(color),
      })
        .bindPopup(
          `<div style="font-size:12px;max-width:210px;">
            <div style="font-weight:700;color:#0f172a;">${attr.name}</div>
            <div style="color:#64748b;margin:2px 0;">${attr.category.toUpperCase()} · Est. ${formatINR(attr.estimatedCostInr)}</div>
            <div style="color:#334155;">${attr.description}</div>
          </div>`
        )
        .addTo(group);
    }

    for (const listing of listings) {
      boundsPoints.push([listing.lat, listing.lng]);
      L.marker([listing.lat, listing.lng], {
        icon: createSmallDotIcon('#4338ca'),
      })
        .bindPopup(
          `<div style="font-size:12px;max-width:220px;">
            <div style="font-weight:700;color:#0f172a;">${listing.title}</div>
            <div style="color:#4338ca;font-weight:600;margin:2px 0;">${formatINR(listing.priceInr)} ${listing.priceUnit}</div>
            <div style="color:#475569;">${listing.verificationStatus === 'provider_verified' ? 'Provider Verified' : 'Sample Estimate'}</div>
          </div>`
        )
        .addTo(group);
    }

    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [48, 48], maxZoom: 13 });
    } else {
      map.setView([destination.lat, destination.lng], 12);
    }
  }, [origin, destination, attractions, listings]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-slate-900">
            Interactive Map · {destination.name}
          </span>
          {routeMetrics && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                Route from {origin?.name}: {routeMetrics.km.toLocaleString('en-IN')} km (~{routeMetrics.estHours}h flight)
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-700 inline-block" />
            Destination
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-700 inline-block" />
            Indoor
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-700 inline-block" />
            Outdoor
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-700 inline-block" />
            Stay / Transit
          </span>
        </div>
      </div>
      <div ref={containerRef} className={`w-full ${heightClass}`} />
    </div>
  );
}
