import {
    Box,
    Text,
    Button,
    useBase,
    useCursor,
    useLoadable,
    useRecords,
    useWatchable,
    Input
} from '@airtable/blocks/ui';
import React, { useState, useEffect } from 'react';
import clustering from 'density-clustering';
import { std } from 'mathjs';
import "./style.css";

// These values match the recommended template for this example app.
// You can also change them to match your own base, or add Table/FieldPickers to allow the
// user to choose a table and field to update.
const TABLE_NAME = 'Participants';
const FIELD_NAME = 'Bucket';

function UpdateRecordsApp() {
    const base = useBase();
    const cursor = useCursor();

    const tableToUpdate = base.getTableByName(TABLE_NAME);
    const bucketsTable = base.getTableByName("Buckets");

    const numberField = tableToUpdate.getFieldByName(FIELD_NAME);

    // cursor.selectedRecordIds isn't loaded by default, so we need to load it
    // explicitly with the useLoadable hook. The rest of the code in the
    // component will not run until it has loaded.
    useLoadable(cursor);

    // Re-render the app whenever the selected records change.
    useWatchable(cursor, ['selectedRecordIds']);

    if (cursor.activeTableId !== tableToUpdate.id) {
        return (
            <Container>
                <Text>Switch to the “{tableToUpdate.name}” table to use this app.</Text>
            </Container>
        );
    }

    return (
        <Container>
            <ClusterParticipantsButton
                tableToUpdate={tableToUpdate}
                fieldToUpdate={numberField}
                selectedRecordIds={cursor.selectedRecordIds}
                bucketsTable={bucketsTable}
            />
        </Container>
    );
}

function Container({children}) {
    return (
        <Box
            position="absolute"
            top={0}
            bottom={0}
            left={0}
            right={0}
            display="flex"
            alignItems="center"
            justifyContent="center"
        >
            {children}
        </Box>
    );
}

// Map of field ID to field name
const fieldIdNameMap = {
    score: "fldAoT3mVItCSfO3M",
    name: "fldWIGdIb09I4pGXE",
    creationDate: "fldZPrGNGWDBL7uy1",
    careerLevel: "fldojIliqwt7tIJjl",
    mlSkill: "fldzeemMfoKHIjoZp"
}

function ClusterParticipantsButton({tableToUpdate, fieldToUpdate, selectedRecordIds, bucketsTable}) {
    const records = useRecords(tableToUpdate);
    const bucketRecords = useRecords(bucketsTable);
    const [participants] = useState([...records]);
    const [generatedBuckets, setGeneratedBuckets] = useState([]);
    const [bucketStatistics, setBucketStatistics] = useState([]);
    const [clusteringRuns, setClusteringRuns] = useState(0);
    const [goalBucketSize, setGoalBucketSize] = useState(50);
    const [updatingRecords, setUpdatingRecords] = useState(false);

    const numberOfParticipants = records.length;

    useEffect(() => {
        // Start of clustering algorithm
        let dataset = [];

        participants.forEach(participant => {
            let participantData = participant._data.cellValuesByFieldId
            dataset.push([
                participantData[fieldIdNameMap.careerLevel],
                participantData[fieldIdNameMap.mlSkill]
            ])
        })

        const maxBucketSize = goalBucketSize < 25 ? 25 : goalBucketSize;
        const numberOfBuckets = Math.round(dataset.length/maxBucketSize)
        
        let kmeans = new clustering.KMEANS();

        // Returns an array of arrays divided into clusters with the id's of participants
        let clusters = kmeans.run(dataset, numberOfBuckets);
        console.log(clusters)

        // Create buckets of ~50 matched participants containing the participant ID's
        let buckets = [[]];
        let currentBucket = 0;
        let fittedBucketSize = Math.ceil(dataset.length/numberOfBuckets);
        let clusterStatistics = [];
        clusters.forEach(cluster => {
            let clusterMlSkills = []
            let clusterCareerLevels = []

            // Calculate statistics for each cluster
            cluster.forEach(participant => {
                let participantFields = participants[parseInt(participant)]._data.cellValuesByFieldId
                clusterMlSkills.push(participantFields[fieldIdNameMap.mlSkill])
                clusterCareerLevels.push(participantFields[fieldIdNameMap.careerLevel])
            })
            const clusterIndex = clusters.indexOf(cluster);
            const clusterAvgMlSkill = (clusterMlSkills.reduce((a, b) => a + b, 0) / clusterMlSkills.length).toFixed(2);
            const clusterAvgCareerLevel = (clusterCareerLevels.reduce((a, b) => a + b, 0) / clusterCareerLevels.length).toFixed(2);
            const clusterStdMlSkill = std(clusterMlSkills).toFixed(2);
            const clusterStdCareerLevel = std(clusterCareerLevels).toFixed(2);
            clusterStatistics.push({clusterIndex, clusterAvgMlSkill, clusterAvgCareerLevel, clusterStdMlSkill, clusterStdCareerLevel})
        })

        // Sort the clusters based on avgMlSkill + avgCareerLevel of each cluster
        // This is to prevent vastly different clusters from being merged into the same bucket later
        //clusterStatistics.sort((a, b) => (distance([parseFloat(a.clusterAvgMlSkill), parseFloat(a.clusterAvgCareerLevel)], [0,0]) - distance([parseFloat(b.clusterAvgMlSkill), parseFloat(b.clusterAvgCareerLevel)], [0,0])));
        clusterStatistics.sort((a, b) => (parseFloat(a.clusterAvgMlSkill)+parseFloat(a.clusterAvgCareerLevel)) - (parseFloat(b.clusterAvgMlSkill)+parseFloat(b.clusterAvgCareerLevel)));
        let sortedClusters = [];
        for (let i = 0; i < clusterStatistics.length; i++) {
            sortedClusters[i] = clusters[clusterStatistics[i].clusterIndex]
        }
        console.log(clusterStatistics)

        sortedClusters.forEach(cluster => {
            // Add participants to buckets until the max bucket size is reached
            cluster.forEach(participant => {
                if (buckets[currentBucket].length >= fittedBucketSize) {
                    currentBucket += 1
                    buckets[currentBucket] = []
                }
                const participantFields = participants[parseInt(participant)]._data.cellValuesByFieldId
                const participantID = participants[parseInt(participant)].id
                buckets[currentBucket].push({
                    id: participantID,
                    name: participantFields[fieldIdNameMap.name],
                    mlSkill: participantFields[fieldIdNameMap.mlSkill],
                    careerLevel: participantFields[fieldIdNameMap.careerLevel]
                })
            })
        })
        // End of clustering algorithm

        // Bucket statistics
        let newBucketStatistics = []
        buckets.forEach(bucket => {
            let bucketMlSkills = []
            let bucketCareerLevels = []
            bucket.forEach(participant => {
                bucketMlSkills.push(participant.mlSkill)
                bucketCareerLevels.push(participant.careerLevel)
            })
            const bucketAvgMlSkill = (bucketMlSkills.reduce((a, b) => a + b, 0) / bucketMlSkills.length).toFixed(2);
            const bucketAvgCareerLevel = (bucketCareerLevels.reduce((a, b) => a + b, 0) / bucketCareerLevels.length).toFixed(2);
            const bucketStdMlSkill = std(bucketMlSkills).toFixed(2);
            const bucketStdCareerLevel = std(bucketCareerLevels).toFixed(2);
            newBucketStatistics.push({bucketAvgMlSkill, bucketAvgCareerLevel, bucketStdMlSkill, bucketStdCareerLevel})
        })
        setGeneratedBuckets(buckets);
        setBucketStatistics(newBucketStatistics);
    }, [participants, clusteringRuns, goalBucketSize])

    const selectedRecordIdsSet = new Set(selectedRecordIds);
    const recordsToUpdate = records.filter(record => selectedRecordIdsSet.has(record.id));

    const updates = recordsToUpdate.map(record => ({
        id: record.id,
        fields: {
            // Here, we add 1 to the current value, but you could extend this to support
            // different operations.
            // [fieldToUpdate.id] is used to use the value of fieldToUpdate.id as the key
            [fieldToUpdate.id]: record.getCellValue(fieldToUpdate) + 1,
        },
    }));

    const shouldButtonBeDisabled = !tableToUpdate.hasPermissionToUpdateRecords(updates) || updatingRecords;

    return (
        <div>
            <strong>Total participants:</strong><span> {numberOfParticipants}</span>
            <br />
            <br />
            {/* <strong>Selected participants:</strong><span> {selectedRecordIds.length}</span> */}
            <strong>Goal bucket size (min. 25): </strong>
            <Input
                value={goalBucketSize}
                onChange={e => {
                    setGoalBucketSize(parseInt(e.target.value) > 0 ? parseInt(e.target.value) : 0);
                }}
                placeholder="Goal bucket size"
                width="150px"
            />
            <br /><br />
            <Button
                variant="primary"
                onClick={async function() {
                    setClusteringRuns(clusteringRuns+1);
                }}
                disabled={shouldButtonBeDisabled}
            >
                Generate new buckets
            </Button>
            <br /><br />
            <strong>Generated buckets</strong>
            <br /> <br />
            <table>
                <tr>
                    <th>Bucket</th>
                    <th>Participants</th>
                    <th>ML skill (avg.)</th>
                    <th>Career level (avg.)</th>
                    <th>ML skill (std. dev.)</th>
                    <th>Career level (std. dev.)</th>
                </tr>
                {bucketStatistics.map(bucket => {
                    return (
                        <tr key={bucketStatistics.indexOf(bucket)}>
                            <td>{bucketStatistics.indexOf(bucket)+1}</td>
                            <td>{generatedBuckets[bucketStatistics.indexOf(bucket)].length}</td>
                            {Object.entries(bucket).map(keyValue => {
                                return <td key={keyValue[0]}>{keyValue[1]}</td>
                            })}
                        </tr>
                    )
                })}
            </table>
            <br /><br />
            <Button
                variant="primary"
                onClick={async function() {
                    console.log(generatedBuckets);
                }}
                disabled={shouldButtonBeDisabled}
            >
                Print buckets to browser console
            </Button>
            <br />
            <br />
            <Button
                variant="primary"
                onClick={async function() {
                    setUpdatingRecords(true);
                    let newBucketId = bucketRecords.length;
                    for (let i = 0; i < generatedBuckets.length; i++) {
                        newBucketId += 1;
                        await bucketsTable.createRecordAsync({"Name": `Bucket ${newBucketId}`});
                        const participants = generatedBuckets[i]
                        let participantsToLink = []
                        for (let z = 0; z < participants.length; z++) {
                            const id = participants[z].id
                            participantsToLink.push({id})
                        }
                        const newBucketRecordsQuery = await bucketsTable.selectRecordsAsync({fields: bucketsTable.fields});
                        const newBucketRecords = newBucketRecordsQuery.records;
                        await bucketsTable.updateRecordAsync(newBucketRecords[newBucketId-1], {
                            'Participants': participantsToLink
                        });
                    }
                    setUpdatingRecords(false);
                }}
                disabled={shouldButtonBeDisabled}
            >
                Link participants to buckets
            </Button>
            <br />
            <br />
            <strong>Danger zone</strong>
            <br /><br />
            <Button
                variant="danger"
                onClick={async function() {
                    setUpdatingRecords(true);
                    const bucketRecordsQuery = await bucketsTable.selectRecordsAsync({fields: bucketsTable.fields});
                    const bucketRecords = bucketRecordsQuery.records;
                    for (let i = 0; i < bucketRecords.length; i++) {
                        await bucketsTable.updateRecordAsync(bucketRecords[i], {
                            'Participants': []
                        });
                    }
                    setUpdatingRecords(false);
                }}
                disabled={shouldButtonBeDisabled}
            >
                Unlink all buckets
            </Button>
        </div>
    );
}

export default UpdateRecordsApp;
