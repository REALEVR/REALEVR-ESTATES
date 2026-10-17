import { useEffect, useRef, useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ConnectRoomsButton from './ConnectRoomsButton'
import DirectS3TourUpload from './DirectS3TourUpload'
import RoomCaptureGuide from './RoomCaptureGuide'
import Tour360Uploader from './Tour360Uploader'

interface TourUploadPanelProps {
    propertyId: number
    /** Called with the tour link whenever a tour goes live, by any of the three routes. */
    onPublished: (tourUrl: string) => void
}

/**
 * The one place to add a tour to a property, for agents in their property editor and for admins in the Virtual Tour Manager:
 * 360 photos from a 360 camera (the quickest), a phone capture for people without one, or a 3D Vista export. Everything happens
 * on this screen: no jumping to another page and no losing the property you were on.
 */
export default function TourUploadPanel({ propertyId, onPublished }: TourUploadPanelProps) {
    const [tab, setTab] = useState('360')
    // Set when a 360-photo or phone-captured tour goes live: only those have rooms to join with doors.
    const [justPublished, setJustPublished] = useState<{ url: string; rooms: boolean } | null>(null)
    const doneRef = useRef<HTMLDivElement>(null)

    // The success card sits above the uploader; bring it into view so the result is never missed after a long upload.
    useEffect(() => {
        if (justPublished) doneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, [justPublished])

    const published = (url: string, rooms: boolean) => {
        setJustPublished({ url, rooms })
        onPublished(url)
    }

    return (
        <div className="space-y-4">
            {justPublished && (
                <div ref={doneRef} className="rounded-lg border border-green-200 bg-green-50 p-4" data-testid="tour-published">
                    <div className="flex items-center gap-2 font-medium text-green-800">
                        <Check className="h-5 w-5" /> Your virtual tour is live
                    </div>
                    <p className="mt-1 text-sm text-green-800/90">
                        {justPublished.rooms
                            ? 'Next, join the rooms with doors so visitors can walk from one to the next.'
                            : 'Visitors can now open it from the property page.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => window.open(justPublished.url, '_blank')}>
                            <ExternalLink className="mr-2 h-4 w-4" /> Open the tour
                        </Button>
                        {justPublished.rooms && <ConnectRoomsButton propertyId={propertyId} tourUrl={justPublished.url} />}
                    </div>
                </div>
            )}

            <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="grid h-auto w-full grid-cols-3">
                    <TabsTrigger value="360" className="whitespace-normal py-2">
                        360 photos
                    </TabsTrigger>
                    <TabsTrigger value="phone" className="whitespace-normal py-2">
                        Phone capture
                    </TabsTrigger>
                    <TabsTrigger value="zip" className="whitespace-normal py-2">
                        3D Vista ZIP
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="360" className="mt-4">
                    <Tour360Uploader propertyId={propertyId} onPublished={(url) => published(url, true)} />
                </TabsContent>

                <TabsContent value="phone" className="mt-4">
                    <RoomCaptureGuide propertyId={propertyId} onPublished={(url) => published(url, true)} />
                </TabsContent>

                <TabsContent value="zip" className="mt-4">
                    <div className="rounded-lg border bg-card p-4">
                        <h3 className="mb-2 text-lg font-semibold">Upload a 3D Vista export</h3>
                        <p className="mb-4 text-sm text-muted-foreground">
                            Already have a tour exported from 3D Vista, Pano2VR or similar software? Upload the ZIP file. Maximum size: 5GB.
                        </p>
                        <DirectS3TourUpload propertyId={propertyId} onSuccess={(url) => published(url, false)} />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
