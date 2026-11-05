"use client";

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

export function SettingsView({ rid }: { rid: string }) {
  const restaurant = useRestaurant(rid);
  const r = restaurant.data;

  return (
    <>
      <PageHeader title="Établissement" description="Informations, commande, images, horaires et postes de cuisine." />
      {restaurant.isPending ? (
        <div className="grid gap-4">
          <Skeleton className="h-9 w-full max-w-xl" />
          <Skeleton className="h-96" />
        </div>
      ) : restaurant.isError || !r ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {errorMessage(restaurant.error)}{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => restaurant.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : (
        <Tabs defaultValue="info" className="gap-4">
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <TabsList>
              <TabsTrigger value="info">Informations</TabsTrigger>
              <TabsTrigger value="orders">Commande</TabsTrigger>
              <TabsTrigger value="images">Images</TabsTrigger>
              <TabsTrigger value="hours">Horaires</TabsTrigger>
              <TabsTrigger value="stations">Postes de cuisine</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="info" forceMount className="data-[state=inactive]:hidden">
            <InfoForm key={r.id} restaurant={r} />
          </TabsContent>
          <TabsContent value="orders" forceMount className="data-[state=inactive]:hidden">
            <OrdersForm key={r.id} restaurant={r} />
          </TabsContent>
          <TabsContent value="images">
            <ImagesSection restaurant={r} />
          </TabsContent>
          <TabsContent value="hours" forceMount className="data-[state=inactive]:hidden">
            <HoursEditor key={r.id} restaurant={r} />
          </TabsContent>
          <TabsContent value="stations">
            <StationsSection rid={rid} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
