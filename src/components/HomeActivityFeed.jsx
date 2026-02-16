import React from 'react';
import {Box, Text} from 'ink';

const MAX_ACTIVITY_ITEMS = 10;

function ActivityItem({item}) {
	return (
		<Box flexDirection="column" paddingX={1}>
			<Text color="#58d7a3">● <Text color="#b7bddf">{item.message}</Text></Text>
			<Text color="#6e76a8">  {item.relativeTime}</Text>
		</Box>
	);
}

export function HomeActivityFeed({activities, width = 44}) {
	const visibleActivities = (activities ?? []).slice(0, MAX_ACTIVITY_ITEMS);

	return (
		<Box
			width={width}
			flexDirection="column"
			borderStyle="single"
			borderColor="#262d50"
			backgroundColor="#111527"
			paddingX={1}
			paddingY={0}
		>
			<Text color="#aab2da">Activity</Text>
			{visibleActivities.length === 0 && <Text color="#626b9b">All quiet on the western front. </Text>}
			{visibleActivities.map((activity) => (
				<Box key={activity.id} flexDirection="column">
					<ActivityItem item={activity} />
				</Box>
			))}
		</Box>
	);
}
