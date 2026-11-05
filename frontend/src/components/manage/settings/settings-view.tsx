"use client";

import { ChefHat, Clock, ImageIcon, ShoppingBag, Store } from "lucide-react";

import { useCan } from "@/components/manage/layout/permissions";
import { PageHeader } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api/client";

import { HoursEditor } from "./hours-editor";
import { ImagesSection } from "./images-section";
import { InfoForm } from "./info-form";
import { OrdersForm } from "./orders-form";
import { StationsSection } from "./stations-section";
import { useRestaurant } from "./use-restaurant";

const TABS = [
  { value: "info", label: "Informations", icon: Store },
  { value: "orders", label: "Commande", icon: ShoppingBag },
  { value: "images", label: "Images", icon: ImageIcon },
  { value: "hours", label: "Horaires", icon: Clock },
  { value: "stations", label: "Postes de cuisine", icon: ChefHat },
] as const;

export function SettingsView({ rid }: { rid: string }) {
  const restaurant = useRestaurant(rid);
  const r = restaurant.data;
  const can = useCan(rid);
  const canInfo = can("restaurant.edit");
  const canSettings = can("settings.edit");
  const canMedia = can("media.manage");
  const anyEdit = canInfo || canSettings || canMedia;

  return (
    <>
      <PageHeader
        title="Établissement"
        description={
          anyEdit
            ? "Informations, commande, images, horaires et postes de cuisine."
            : "Informations, commande, images, horaires et postes de cuisine (consultation uniquement)."
        }
      />
      {restaurant.isPending ? (
        <div className="grid gap-4">
          <Skeleton className="h-9 w-full max-w-xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : restaurant.isError || !r ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {errorMessage(restaurant.error)}{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => restaurant.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : (
        <Tabs defaultValue="info" className="gap-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl p-1 group-data-[orientation=horizontal]/tabs:h-auto sm:w-fit">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="h-9 flex-none rounded-lg px-3">
                <Icon />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="info" forceMount className="data-[state=inactive]:hidden">
            <InfoForm key={r.id} restaurant={r} editable={canInfo} />
          </TabsContent>
          <TabsContent value="orders" forceMount className="data-[state=inactive]:hidden">
            <OrdersForm key={r.id} restaurant={r} editable={canSettings} />
          </TabsContent>
          <TabsContent value="images">
            <ImagesSection restaurant={r} editable={canMedia} />
          </TabsContent>
          <TabsContent value="hours" forceMount className="data-[state=inactive]:hidden">
            <HoursEditor key={r.id} restaurant={r} editable={canInfo} />
          </TabsContent>
          <TabsContent value="stations">
            <StationsSection rid={rid} editable={canSettings} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
